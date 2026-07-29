"""Shared parsing helpers for importing a line-item spreadsheet (BuilderTrend
"Estimate Report" exports, or Brent's own hand-built template files) into an
estimate template. The cost-code/markup-normalization logic here mirrors
scripts/import_estimates_from_excel.py's proven behavior against real files."""

import io
from typing import Optional

import openpyxl
import xlrd

TARGET_FIELDS = [
    "title",
    "category",
    "cost_code",
    "quantity",
    "unit_cost",
    "markup",
    "markup_type",
    "description",
    "internal_notes",
]

# Known header text (case-insensitive) from BuilderTrend Estimate Report exports,
# used to auto-guess a starting mapping -- the user can still override any of it.
KNOWN_HEADERS: dict[str, str] = {
    "title": "title",
    "category": "category",
    "cost code": "cost_code",
    "quantity": "quantity",
    "unit cost": "unit_cost",
    "markup": "markup",
    "markup type": "markup_type",
    "description": "description",
    "internal notes": "internal_notes",
}


def parse_workbook(filename: str, content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Returns (headers, rows) from the first sheet of an uploaded .xlsx/.xlsm/.xls
    file. Every cell is coerced to a plain string; blank cells become ''."""
    lower = filename.lower()
    if lower.endswith(".xls"):
        return _parse_xls(content)
    return _parse_xlsx(content)


def _parse_xlsx(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = wb.worksheets[0]
    rows_iter = sheet.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else "" for h in next(rows_iter, [])]
    rows = []
    for raw_row in rows_iter:
        row = {headers[i]: _cell_str(v) for i, v in enumerate(raw_row) if i < len(headers) and headers[i]}
        if any(v for v in row.values()):
            rows.append(row)
    return headers, rows


def _parse_xls(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    wb = xlrd.open_workbook(file_contents=content)
    sheet = wb.sheet_by_index(0)
    headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
    rows = []
    for r in range(1, sheet.nrows):
        row = {headers[c]: _cell_str(sheet.cell_value(r, c)) for c in range(sheet.ncols) if headers[c]}
        if any(v for v in row.values()):
            rows.append(row)
    return headers, rows


def _cell_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def guess_mapping(headers: list[str]) -> dict[str, Optional[str]]:
    mapping: dict[str, Optional[str]] = {field: None for field in TARGET_FIELDS}
    for header in headers:
        field = KNOWN_HEADERS.get(header.strip().lower())
        if field and mapping.get(field) is None:
            mapping[field] = header
    return mapping


def parse_cost_code(raw: str) -> Optional[str]:
    if not raw:
        return None
    if " - " in raw:
        return raw.split(" - ", 1)[0].strip()
    return raw.strip()


def bucket_for(category: str, title: str) -> str:
    if (category or "").strip().upper().startswith("20 -"):
        return "allowance"
    if (title or "").strip().lower() in {"pm fee", "project management fee"}:
        return "pm_fee"
    return "construction"


def normalize_markup(markup_raw: str, markup_type_raw: str, quantity: float) -> tuple[str, float]:
    """Mirrors the source script's markup-type normalization: BuilderTrend's
    "%" -> our percent, "$/unit" -> our flat scaled by quantity so the total
    profit matches, anything else -> flat as-is."""
    try:
        markup = float(markup_raw) if markup_raw else 0.0
    except ValueError:
        markup = 0.0
    normalized = (markup_type_raw or "").strip()
    if normalized == "%":
        return "percent", markup
    if normalized == "$/unit":
        return "flat", round(markup * quantity, 2)
    return "flat", markup
