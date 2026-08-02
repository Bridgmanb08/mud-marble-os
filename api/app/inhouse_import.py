"""Parsing helpers for importing Brent's hand-maintained "In-House <Job Name>.xlsx"
workbooks directly into a project, driven from the browser (Job Import Portal)
instead of the local-only scripts/import_inhouse_sheets.py script. The parsing
logic here is a direct port of that script's proven behavior against real
files -- only the output shape changed (structured preview rows instead of
firing HTTP requests), so the frontend can show a human-review-before-commit
checklist rather than trusting-and-going like the script does."""

from typing import Optional

from .estimate_import import bucket_for, parse_cost_code


def parse_estimate_sheet(ws, existing_keys: set) -> list[dict]:
    """existing_keys: set of (title, unit_cost) tuples already on the project's
    estimate, so already-imported rows can be flagged instead of re-added."""
    header_row = next(ws.iter_rows(min_row=1, max_row=1))
    col = {cell.value: i for i, cell in enumerate(header_row) if cell.value}

    def cell(row, name):
        i = col.get(name)
        if i is None or i >= len(row):
            return None
        v = row[i].value
        return v if v not in ("", None) else None

    rows: list[dict] = []
    for row in ws.iter_rows(min_row=2):
        title = cell(row, "Title")
        if not title or not isinstance(title, str):
            continue
        try:
            unit_cost = float(cell(row, "Unit Cost") or 0)
            quantity = float(cell(row, "Quantity") or 1)
            markup_raw = float(cell(row, "Markup") or 0)
        except (TypeError, ValueError):
            continue
        category = cell(row, "Category") or ""
        raw_cost_code = cell(row, "Cost Code") or ""
        markup_type_raw = cell(row, "Markup Type") or "%"
        description = cell(row, "Description")
        internal_notes = cell(row, "Internal Notes")
        markup_type, markup_value = ("percent", markup_raw) if markup_type_raw == "%" else ("flat", markup_raw)
        rows.append(
            {
                "title": title,
                "category": category,
                "cost_code": parse_cost_code(raw_cost_code),
                "quantity": quantity,
                "unit_cost": unit_cost,
                "markup_type": markup_type,
                "markup_value": markup_value,
                "description": description,
                "internal_notes": internal_notes,
                "bucket": bucket_for(category, title),
                "already_present": (title, unit_cost) in existing_keys,
            }
        )
    return rows


def parse_quickbooks_sheet(ws, existing_keys: set) -> list[dict]:
    """existing_keys: set of (date, amount, description[:60]) tuples already on
    the project's transactions."""
    rows: list[dict] = []
    section: Optional[str] = None
    for row in ws.iter_rows(min_row=1):
        values = [c.value for c in row]
        non_none = [v for v in values if v not in (None, "")]
        if len(non_none) == 1 and isinstance(values[1], str) and values[1] not in ("QUICKBOOKS EXPORT",):
            if values[1] == "ESTIMATE VS COST":
                break
            section = values[1]
            continue
        date_val, name_val, memo_val, amount_val, code_val = (values[1:6] + [None] * 5)[:5]
        if not hasattr(date_val, "date") or not isinstance(amount_val, (int, float)):
            continue
        tx_date = date_val.date().isoformat()
        amount = float(amount_val)
        is_income = section == "Income"
        signed_amount = abs(amount) if is_income else -abs(amount)
        description = memo_val or None
        key = (tx_date, round(signed_amount, 2), (description or "")[:60])
        rows.append(
            {
                "date": tx_date,
                "vendor": name_val or None,
                "transaction_type": "income" if is_income else "expense",
                "amount": signed_amount,
                "payment_source": section,
                "cost_code": parse_cost_code(code_val) if code_val else None,
                "description": description,
                "already_present": key in existing_keys,
            }
        )
    return rows


def parse_contractors_sheet(ws) -> list[dict]:
    blocks: list[dict] = []
    rows = list(ws.iter_rows(min_row=1))
    i = 0
    while i < len(rows):
        row = rows[i]
        values = [c.value for c in row]
        non_none = [v for v in values if v not in (None, "")]
        is_header_or_label = values[1] in (
            None,
            "CONTRACTORS",
            "Contract/Agreement",
            "Line Item",
            "Total Contract",
        )
        if len(non_none) == 1 and isinstance(values[1], str) and not is_header_or_label:
            name = values[1].strip()
            i += 1
            if name.upper() == "NAME":
                while i < len(rows) and rows[i][1].value != "Total Contract":
                    i += 1
                i += 1
                continue

            contract_items: list[dict] = []
            payments: list[dict] = []
            while i < len(rows) and rows[i][1].value in ("Contract/Agreement", "Line Item"):
                i += 1
            while i < len(rows) and rows[i][1].value != "Total Contract":
                r = rows[i]
                r_vals = [c.value for c in r]
                if r_vals[1] in ("Contract/Agreement", "Line Item"):
                    i += 1
                    continue
                desc, amount = r_vals[1] if len(r_vals) > 1 else None, r_vals[2] if len(r_vals) > 2 else None
                pay_date, pay_amount, pay_category = (
                    r_vals[4] if len(r_vals) > 4 else None,
                    r_vals[5] if len(r_vals) > 5 else None,
                    r_vals[6] if len(r_vals) > 6 else None,
                )
                if isinstance(amount, (int, float)):
                    contract_items.append({"description": desc, "amount": float(amount)})
                if hasattr(pay_date, "date") and isinstance(pay_amount, (int, float)):
                    payments.append(
                        {
                            "date": pay_date.date().isoformat(),
                            "amount": float(pay_amount),
                            "category": pay_category,
                        }
                    )
                i += 1
            i += 1  # past "Total Contract" row
            if contract_items or payments:
                blocks.append(
                    {
                        "subcontractor_name": name,
                        "contract_items": contract_items,
                        "payments": payments,
                    }
                )
        else:
            i += 1
    return blocks
