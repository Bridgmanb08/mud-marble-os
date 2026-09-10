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
__all__ = ["NumberedCanvas", "build_styles", "build_letterhead", "breadcrumb_for", "xml_escape", "SIDE_MARGIN"]

SIDE_MARGIN = 0.6 * inch


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
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.grey)
        self.drawRightString(letter[0] - 0.5 * inch, 0.3 * inch, f"Page {self._pageNumber} of {page_count}")


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
        "total": ParagraphStyle("total", parent=styles["Normal"], fontSize=12, alignment=2),
        "label": ParagraphStyle("label", parent=styles["Normal"], fontSize=7.5, textColor=colors.grey),
        "value": ParagraphStyle("value", parent=styles["Normal"], fontSize=10, spaceAfter=8),
    }


def build_letterhead(styles: dict, page_width: float, breadcrumb: str) -> list:
    """Centered logo + wordmark + company contact line, then a left/right
    row (who this is for / print date) -- the exact header every one of
    these client-facing PDFs opens with."""
    print_date = datetime.now()
    header_row = Table(
        [[
            Paragraph(xml_escape(breadcrumb), styles["small"]),
            Paragraph(f"Print Date: {print_date.month}-{print_date.day}-{print_date.year}", styles["small_right"]),
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
        Image(branding.LOGO_PATH, width=0.55 * inch, height=0.55 * inch, hAlign="CENTER"),
        Paragraph("Mud &amp; Marble", styles["wordmark_h1"]),
        Paragraph(branding.COMPANY_ADDRESS_LINE, styles["company_line"]),
        header_row,
    ]


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
