"""Parsing helpers for importing Brent's hand-maintained "In-House <Job Name>.xlsx"
workbooks directly into a project, driven from the browser (Job Import Portal)
instead of the local-only scripts/import_inhouse_sheets.py script. The parsing
logic here is a direct port of that script's proven behavior against real
files -- only the output shape changed (structured preview rows instead of
firing HTTP requests), so the frontend can show a human-review-before-commit
checklist rather than trusting-and-going like the script does.

Re-importing the same (or an updated) file is expected -- Shannon will revisit
a job's workbook more than once as real numbers firm up. A row whose dedupe key
matches an existing record is never silently re-inserted: if every compared
field is identical it's flagged `already_present` (nothing to do); if any
field differs it's flagged `conflict` with a per-field diff, so the reviewer
can choose to update the existing record in place instead of creating a
duplicate or silently overwriting it."""

from typing import Optional

from .estimate_import import bucket_for, parse_cost_code


def diff_fields_helper(existing: dict, incoming: dict, fields: list[tuple]) -> list[dict]:
    """fields: list of (label, existing_key, incoming_key) triples. Returns a
    FieldDiff-shaped dict per field whose stringified values differ."""
    diffs = []
    for label, existing_key, incoming_key in fields:
        old = existing.get(existing_key)
        new = incoming.get(incoming_key)
        old_norm = round(old, 2) if isinstance(old, float) else old
        new_norm = round(new, 2) if isinstance(new, float) else new
        if old_norm != new_norm and not (old_norm in (None, "") and new_norm in (None, "")):
            diffs.append({"field": label, "existing": str(old) if old is not None else None, "incoming": str(new) if new is not None else None})
    return diffs


_ESTIMATE_DIFF_FIELDS = [
    ("Quantity", "quantity", "quantity"),
    ("Markup type", "markup_type", "markup_type"),
    ("Markup value", "markup_value", "markup_value"),
    ("Description", "description", "description"),
    ("Internal notes", "notes_internal", "internal_notes"),
    ("Bucket", "bucket", "bucket"),
]

# A scanned/photographed estimate page can't show "Internal Notes" -- that's an
# internal-only column, not something printed for external review -- so
# comparing it for scan-sourced rows would flag a false conflict on every
# existing item that happens to have a note, purely because the scan can
# never populate it. Scan-sourced diffs skip that one field.
_ESTIMATE_SCAN_DIFF_FIELDS = [f for f in _ESTIMATE_DIFF_FIELDS if f[2] != "internal_notes"]


def diff_and_wrap_estimate_row(title: str, unit_cost: float, category: Optional[str], raw_cost_code, incoming: dict, existing_by_key: dict, diff_fields: list[tuple] = _ESTIMATE_DIFF_FIELDS) -> dict:
    """incoming: {quantity, markup_type, markup_value, description, internal_notes, bucket}.
    Shared by the Excel row loop (parse_estimate_sheet) and the AI-scan item
    loop (diff_estimate_scan_items) -- the only thing that differs between
    sources is how `incoming` gets built and which fields are worth diffing;
    the dedupe/diff *logic* is identical either way."""
    existing = existing_by_key.get((title, unit_cost))
    diff = diff_fields_helper(existing, incoming, diff_fields) if existing else []
    return {
        "title": title,
        "category": category,
        "cost_code": parse_cost_code(raw_cost_code),
        **incoming,
        "unit_cost": unit_cost,
        "already_present": existing is not None,
        "existing_id": existing["id"] if existing else None,
        "conflict": bool(diff),
        "diff": diff,
    }


def diff_estimate_scan_items(items: list, existing_by_key: dict) -> list[dict]:
    """items: list of EstimateScanItem (ai_provider.py) from a photographed/
    scanned estimate page. Mirrors parse_estimate_sheet's per-row shape so the
    router's response is identical regardless of source."""
    rows: list[dict] = []
    for item in items:
        incoming = {
            "quantity": item.quantity,
            "markup_type": item.markup_type,
            "markup_value": item.markup_value,
            "description": item.description,
            "internal_notes": None,
            "bucket": bucket_for(item.category or "", item.title),
        }
        rows.append(diff_and_wrap_estimate_row(item.title, item.unit_cost, item.category, item.cost_code, incoming, existing_by_key, _ESTIMATE_SCAN_DIFF_FIELDS))
    return rows


def parse_estimate_sheet(ws, existing_by_key: dict) -> list[dict]:
    """existing_by_key: dict of (title, unit_cost) -> existing line item row
    (id, quantity, markup_type, markup_value, description, notes_internal,
    bucket), so a re-imported row can be compared field-by-field instead of
    just flagged present/absent."""
    # Case/whitespace-insensitive header matching -- a hand-maintained sheet's
    # header text ("Internal Notes" vs "internal notes ", etc.) doesn't
    # always match byte-for-byte, and an exact-string lookup used to fail
    # SILENTLY (col.get() just returns None, same as a genuinely missing
    # column), quietly dropping every value in that column with no error.
    # This was traced back as the likely cause of an entire re-imported
    # estimate coming through with no internal notes at all.
    header_row = next(ws.iter_rows(min_row=1, max_row=1))
    col = {str(cell.value).strip().lower(): i for i, cell in enumerate(header_row) if cell.value}

    def cell(row, name):
        i = col.get(name.strip().lower())
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
        incoming = {
            "quantity": quantity,
            "markup_type": markup_type,
            "markup_value": markup_value,
            "description": description,
            "internal_notes": internal_notes,
            "bucket": bucket_for(category, title),
        }
        rows.append(diff_and_wrap_estimate_row(title, unit_cost, category, raw_cost_code, incoming, existing_by_key))
    return rows


_TRANSACTION_DIFF_FIELDS = [
    ("Vendor", "vendor", "vendor"),
    ("Type", "transaction_type", "transaction_type"),
    ("Payment source", "payment_source", "payment_source"),
]

# `payment_source` is an internal categorization (which account/card funded
# it) -- a photographed bank statement or receipt can't show that, so
# comparing it for scan-sourced rows would flag a false conflict on every
# existing transaction that happens to have one set.
_TRANSACTION_SCAN_DIFF_FIELDS = [f for f in _TRANSACTION_DIFF_FIELDS if f[2] != "payment_source"]


def diff_and_wrap_transaction_row(tx_date: str, signed_amount: float, cost_code_raw, description: Optional[str], incoming: dict, existing_by_key: dict, diff_fields: list[tuple] = _TRANSACTION_DIFF_FIELDS) -> dict:
    """incoming: {vendor, transaction_type, payment_source}. Shared by the
    Excel row loop (parse_quickbooks_sheet) and the AI-scan item loop
    (diff_transaction_scan_items)."""
    key = (tx_date, round(signed_amount, 2), (description or "")[:60])
    existing = existing_by_key.get(key)
    diff = diff_fields_helper(existing, incoming, diff_fields) if existing else []
    return {
        "date": tx_date,
        "amount": signed_amount,
        **incoming,
        "cost_code": parse_cost_code(cost_code_raw) if cost_code_raw else None,
        "description": description,
        "already_present": existing is not None,
        "existing_id": existing["id"] if existing else None,
        "conflict": bool(diff),
        "diff": diff,
    }


def diff_transaction_scan_items(items: list, existing_by_key: dict) -> list[dict]:
    """items: list of TransactionScanItem (ai_provider.py) from a photographed/
    scanned bank statement or receipt. Mirrors parse_quickbooks_sheet's
    per-row shape so the router's response is identical regardless of source."""
    rows: list[dict] = []
    for item in items:
        signed_amount = abs(item.amount) if item.transaction_type == "income" else -abs(item.amount)
        incoming = {"vendor": item.vendor, "transaction_type": item.transaction_type, "payment_source": None}
        rows.append(diff_and_wrap_transaction_row(item.date, signed_amount, None, item.description, incoming, existing_by_key, _TRANSACTION_SCAN_DIFF_FIELDS))
    return rows


def parse_quickbooks_sheet(ws, existing_by_key: dict) -> list[dict]:
    """existing_by_key: dict of (date, amount, description[:60]) -> existing
    transaction row (id, vendor, transaction_type, payment_source), so a
    re-imported row can be compared field-by-field instead of just flagged
    present/absent."""
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
        incoming = {
            "vendor": name_val or None,
            "transaction_type": "income" if is_income else "expense",
            "payment_source": section,
        }
        rows.append(diff_and_wrap_transaction_row(tx_date, signed_amount, code_val, description, incoming, existing_by_key))
    return rows


def parse_contractors_sheet(
    ws,
    subs_by_name: dict,
    existing_items_by_sub: dict,
    existing_payment_keys: set,
) -> list[dict]:
    """subs_by_name: company_name.lower() -> subcontractor_id, for matching a
    block to an existing subcontractor. existing_items_by_sub: subcontractor_id
    -> {description: existing project_subcontractor_items row}, for flagging
    already-present/conflicting contract line items instead of re-adding them
    every time the sheet is re-imported. existing_payment_keys: the same
    (date, amount, description[:60]) key space used for top-level transactions
    (payments are inserted as transactions too), so a re-imported payment is
    flagged present rather than duplicated."""
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
                matched_id = subs_by_name.get(name.strip().lower())
                existing_items = existing_items_by_sub.get(matched_id, {}) if matched_id else {}

                items_out = []
                for item in contract_items:
                    existing = existing_items.get(item["description"])
                    diff = diff_fields_helper(existing, item, [("Amount", "amount", "amount")]) if existing else []
                    items_out.append(
                        {
                            **item,
                            "already_present": existing is not None,
                            "existing_id": existing["id"] if existing else None,
                            "conflict": bool(diff),
                            "diff": diff,
                        }
                    )

                payments_out = []
                for payment in payments:
                    pay_desc = f"Payment to {name}"
                    key = (payment["date"], round(-abs(payment["amount"]), 2), pay_desc[:60])
                    payments_out.append({**payment, "already_present": key in existing_payment_keys})

                blocks.append(
                    {
                        "subcontractor_name": name,
                        "matched_subcontractor_id": matched_id,
                        "contract_items": items_out,
                        "payments": payments_out,
                    }
                )
        else:
            i += 1
    return blocks
