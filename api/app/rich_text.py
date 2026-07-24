import re
from html.parser import HTMLParser
from typing import List, Optional
from xml.sax.saxutils import escape

# execCommand's legacy fontSize scale (1-7) mapped to roughly-equivalent point sizes,
# since ReportLab's <font size="..."> expects points, not the legacy HTML scale.
_LEGACY_FONT_SIZE_PT = {"1": "8", "2": "10", "3": "12", "4": "14", "5": "18", "6": "24", "7": "36"}


class _RichTextToReportLab(HTMLParser):
    """Converts the HTML produced by the browser's contentEditable/execCommand rich text
    editor into the small markup subset ReportLab's Paragraph understands (b/i/u/strike/br/font).
    Unknown tags are dropped (their text content is kept); font *family* is intentionally not
    passed through since an unregistered face name would raise at PDF build time."""

    def __init__(self):
        super().__init__()
        self.out: List[str] = []
        self.stack: List[Optional[str]] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("b", "strong"):
            self.out.append("<b>")
            self.stack.append("b")
        elif tag in ("i", "em"):
            self.out.append("<i>")
            self.stack.append("i")
        elif tag == "u":
            self.out.append("<u>")
            self.stack.append("u")
        elif tag in ("s", "strike", "del"):
            self.out.append("<strike>")
            self.stack.append("strike")
        elif tag == "br":
            self.out.append("<br/>")
        elif tag in ("div", "p"):
            self.stack.append(None)
        elif tag == "font":
            size = attrs.get("size")
            pt = _LEGACY_FONT_SIZE_PT.get(size or "", None)
            if pt:
                self.out.append(f'<font size="{pt}">')
                self.stack.append("font")
            else:
                self.stack.append(None)
        elif tag == "span":
            style = (attrs.get("style") or "").lower()
            picked = None
            if "underline" in style:
                picked = "u"
            elif "line-through" in style:
                picked = "strike"
            elif re.search(r"font-weight:\s*(bold|[6-9]00)", style):
                picked = "b"
            elif "italic" in style:
                picked = "i"
            if picked:
                self.out.append(f"<{picked}>")
            self.stack.append(picked)
        else:
            self.stack.append(None)

    def handle_endtag(self, tag):
        if tag == "br":
            return
        if tag in ("div", "p"):
            if self.stack:
                self.stack.pop()
            self.out.append("<br/><br/>")
            return
        if not self.stack:
            return
        top = self.stack.pop()
        if top:
            self.out.append(f"</{top}>")

    def handle_data(self, data):
        self.out.append(escape(data))

    def get_text(self) -> str:
        return "".join(self.out).strip()


def rich_text_to_pdf_markup(value: Optional[str]) -> str:
    """Safe to call on anything -- legacy plain text (pre-rich-text estimates) or HTML
    from the rich text editor. Never raises; falls back to escaped plain text on any
    parse trouble so a bad value can never break PDF export."""
    if not value:
        return ""
    if "<" not in value:
        escaped = escape(value)
        return escaped.replace("\n\n", "<br/><br/>").replace("\n", "<br/>")
    try:
        parser = _RichTextToReportLab()
        parser.feed(value)
        return parser.get_text()
    except Exception:
        return escape(re.sub(r"<[^>]+>", "", value))
