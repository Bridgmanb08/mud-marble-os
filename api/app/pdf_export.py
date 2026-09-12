"""Shared reportlab PDF-export plumbing. The Estimate export was first to
need a client-facing PDF with the brand letterhead; Invoices and Change
Orders reuse the exact same numbered-page-count trick and header layout
instead of a second/third hand-copied version of it."""
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Image, Paragraph, Table, TableStyle

from . import branding

# Every free-text value on a PDF (names, titles, descriptions) is
# user-entered and has to be escaped before it reaches a reportlab
# Paragraph(), which parses a small XML-like markup subset; an unescaped
# '<' followed by a letter with no matching '>' throws a paraparser syntax
# error and 500s the whole export. Re-exported here so callers don't need
# their own `from xml.sax.saxutils import escape`.
__all__ = [
    "NumberedCanvas",
    "build_styles",
    "build_letterhead",
    "build_info_card",
    "build_totals_band",
    "breadcrumb_for",
    "fmt_pdf_date",
    "STATUS_COLORS",
    "xml_escape",
    "SIDE_MARGIN",
]

SIDE_MARGIN = 0.6 * inch

# The exact text colors index.css's .bg-green/.bg-amber/.bg-red/.bg-blue/
# .bg-gray badges use on screen -- reused here so a status value printed on
# a PDF reads as the same color family as its on-screen badge instead of
# an unrelated color choice invented just for print.
STATUS_COLORS = {
    "green": colors.HexColor("#0F6E56"),
    "amber": colors.HexColor("#854F0B"),
    "red": colors.HexColor("#A32D2D"),
    "blue": colors.HexColor("#185FA5"),
    "gray": colors.HexColor("#5F5E5A"),
}


class NumberedCanvas(Canvas):
    """Standard reportlab two-pass trick for "Page N of M" -- the total page
    count isn't known until the whole document has been laid out, so each
    page's canvas state is buffered via showPage() and only actually drawn
    (with the number stamped on) once save() knows the final count."""

    def __init__(self, *args, **kwargs):
        Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(num_pages)
            Canvas.showPage(self)
        Canvas.save(self)

    def _draw_page_number(self, page_count):
        # A thin brand rule + the company contact line, echoing the
        # letterhead at the top -- without this every page just trails off
        # into blank space with nothing to close it out, which reads as
        # unfinished on a short document (an invoice or CO is often a
        # single mostly-empty page). "Page N of M" keeps its original
        # bottom-right spot alongside it.
        # The rule sits below the document's own 0.5in bottom margin -- if it
        # sat flush with the margin, a page whose content runs all the way
        # down could collide with it instead of leaving clear air above the
        # footer.
        self.setStrokeColor(branding.BRAND_TAN)
        self.setLineWidth(0.5)
        self.line(SIDE_MARGIN, 0.42 * inch, letter[0] - SIDE_MARGIN, 0.42 * inch)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.grey)
        self.drawString(SIDE_MARGIN, 0.3 * inch, branding.COMPANY_ADDRESS_LINE)
        self.drawRightString(letter[0] - SIDE_MARGIN, 0.3 * inch, f"Page {self._pageNumber} of {page_count}")


def build_styles() -> dict:
    """The paragraph styles every export document shares. A document with
    its own extra needs (the Estimate's group-header band, say) adds those
    on top of this dict rather than redefining the common ones."""
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=8.5, leading=12)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=8.2, leading=11)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    th = ParagraphStyle("th", parent=cell, fontName="Helvetica-Bold", textColor=branding.BRAND_BROWN)
    return {
        "wordmark_h1": ParagraphStyle("wordmark_h1", parent=styles["Heading1"], fontSize=14, alignment=1, spaceBefore=4, spaceAfter=1),
        "company_line": ParagraphStyle("company_line", parent=styles["Normal"], fontSize=8, alignment=1, textColor=colors.grey, spaceAfter=10),
        "body": body,
        "cell": cell,
        "cell_right": ParagraphStyle("cell_right", parent=cell, alignment=2),
        "th": th,
        "th_right": ParagraphStyle("th_right", parent=th, alignment=2),
        "small": small,
        "small_right": ParagraphStyle("small_right", parent=small, alignment=2),
        "title": ParagraphStyle("title", parent=styles["Normal"], fontSize=13, spaceBefore=6, spaceAfter=2, fontName="Helvetica-Bold"),
        "address": ParagraphStyle("address", parent=styles["Normal"], fontSize=10.5, textColor=branding.BRAND_BROWN, spaceAfter=10),
        "total": ParagraphStyle("total", parent=styles["Normal"], fontSize=12, alignment=2),
        "label": ParagraphStyle("label", parent=styles["Normal"], fontSize=7.5, textColor=colors.grey, spaceAfter=2),
        "value": ParagraphStyle("value", parent=styles["Normal"], fontSize=10.5, fontName="Helvetica-Bold"),
        "totals_label": ParagraphStyle("totals_label", parent=styles["Normal"], fontSize=9.5, textColor=colors.grey),
        "totals_value": ParagraphStyle("totals_value", parent=styles["Normal"], fontSize=9.5, alignment=2),
        "grand_label": ParagraphStyle("grand_label", parent=styles["Normal"], fontSize=12.5, fontName="Helvetica-Bold"),
        "grand_value": ParagraphStyle(
            "grand_value", parent=styles["Normal"], fontSize=13.5, fontName="Helvetica-Bold", alignment=2, textColor=branding.BRAND_BROWN
        ),
    }


def build_letterhead(styles: dict, page_width: float, breadcrumb: str) -> list:
    """Centered logo + wordmark + company contact line, then a left/right
    row (who this is for / print date) -- the exact header every one of
    these client-facing PDFs opens with."""
    # "Sep 12, 2026" -- the same format fmt_pdf_date renders Issued/Due
    # dates in elsewhere on these documents, so the header's own date
    # doesn't read as a different, less-considered style than the rest
    # of the page (it was a bare "9-12-2026" before).
    print_date = datetime.now().strftime("%b %-d, %Y")
    header_row = Table(
        [[
            Paragraph(xml_escape(breadcrumb), styles["small"]),
            Paragraph(f"Print Date: {print_date}", styles["small_right"]),
        ]],
        colWidths=[page_width * 0.6, page_width * 0.4],
    )
    header_row.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [
        Image(branding.LOGO_PATH, width=0.65 * inch, height=0.65 * inch, hAlign="CENTER"),
        Paragraph("Mud &amp; Marble", styles["wordmark_h1"]),
        Paragraph(branding.COMPANY_ADDRESS_LINE, styles["company_line"]),
        header_row,
    ]


def build_info_card(styles: dict, page_width: float, fields: list, columns: int = 3) -> Table:
    """fields: (label, value, color_or_None) triples. A bordered, tinted
    card summarizing a handful of key facts (type, status, dates, ...) --
    replaces a bare row of label/value text with something that actually
    reads as a designed document section, and gives every export
    (estimate, invoice, change order) the same visual weight for this
    kind of content instead of three different ad hoc treatments.
    `color` lets one field's value stand out (a status, say) in the same
    color family as its on-screen badge -- see STATUS_COLORS -- without a
    full colored pill (reportlab tables don't do rounded/inline chips
    cleanly)."""
    col_width = page_width / columns
    rows: list[list] = []
    for i in range(0, len(fields), columns):
        row_fields = fields[i : i + columns]
        row = []
        for label, value, color in row_fields:
            value_style = styles["value"] if not color else ParagraphStyle(f"value_{label}_{id(color)}", parent=styles["value"], textColor=color)
            row.append([Paragraph(label.upper(), styles["label"]), Paragraph(value, value_style)])
        while len(row) < columns:
            row.append("")
        rows.append(row)
    t = Table(rows, colWidths=[col_width] * columns)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), branding.BRAND_CREAM),
                ("BOX", (0, 0), (-1, -1), 0.75, branding.BRAND_TAN),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return t


def build_totals_band(styles: dict, page_width: float, rows: list) -> Table:
    """rows: (label, value, is_grand_total) triples. A right-aligned totals
    stack with a brand-brown rule above the whole block, extra visual
    weight on whichever row(s) are flagged as the grand total -- shared
    treatment for the estimate's Total Price, the invoice's Amount Due /
    Paid / Balance, and the change order's Price, so all three read as
    the same kind of "the number that matters" moment instead of three
    different ad hoc styles."""
    table_rows = []
    for label, value, is_grand in rows:
        label_style = styles["grand_label"] if is_grand else styles["totals_label"]
        value_style = styles["grand_value"] if is_grand else styles["totals_value"]
        table_rows.append([Paragraph(label, label_style), Paragraph(value, value_style)])
    t = Table(table_rows, colWidths=[page_width * 0.75, page_width * 0.25])
    style_commands = [
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, 0), (-1, 0), 1, branding.BRAND_BROWN),
    ]
    # Extra breathing room above a grand-total row that isn't the very
    # first one (e.g. an invoice's "Balance" following "Amount due"/"Paid").
    for i, (_, _, is_grand) in enumerate(rows):
        if is_grand and i > 0:
            style_commands.append(("TOPPADDING", (0, i), (-1, i), 8))
    t.setStyle(TableStyle(style_commands))
    return t


def fmt_pdf_date(raw) -> str:
    """ISO date/datetime string -> "Sep 10, 2026" for a client-facing PDF.
    Falls back to the raw string rather than raising if it's some other
    shape -- a cosmetic date format is never worth 500ing the export over."""
    if not raw:
        return "—"
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%b %-d, %Y")
    except ValueError:
        return raw


def breadcrumb_for(project: dict) -> str:
    """who this document is for / which job -- client name preferred, falls
    back to the project name; the project name is appended too when it's
    not already redundant with the client name."""
    client = (project.get("clients") or {}) if project else {}
    client_name = f"{client.get('first_name') or ''} {client.get('last_name') or ''}".strip()
    project_name = (project.get("name") or "").split("|")[0].strip()
    who = client_name or project_name
    return who + (f" | {project_name}" if project_name and project_name != who else "")
