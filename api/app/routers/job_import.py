import asyncio
import io

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..deps import CurrentUser, get_current_user
from ..inhouse_import import parse_contractors_sheet, parse_estimate_sheet, parse_quickbooks_sheet
from ..schemas.job_import import (
    ContractorBlock,
    EstimateSheetPreview,
    EstimateSheetRow,
    InHouseSheetPreview,
    JobImportStatus,
    TransactionSheetRow,
)
from ..supabase_client import db_get

router = APIRouter(prefix="/job-import", tags=["job-import"])


def _find_sheet(wb, name: str):
    for sheet_name in wb.sheetnames:
        if sheet_name.strip().lower() == name.lower():
            return wb[sheet_name]
    return None


@router.get("/status", response_model=list[JobImportStatus])
async def get_status(_: CurrentUser = Depends(get_current_user)):
    (
        projects,
        estimates,
        invoices,
        change_orders,
        transactions,
        sub_items,
    ) = await asyncio.gather(
        db_get("projects", "?is_archived=eq.false&select=id,name"),
        db_get("estimates", "?select=project_id,grand_total_owner_price"),
        db_get("invoices", "?select=project_id"),
        db_get("change_orders", "?select=project_id"),
        db_get("transactions", "?select=project_id"),
        db_get("project_subcontractor_items", "?select=project_id"),
    )

    has_estimate = {e["project_id"] for e in estimates if (e.get("grand_total_owner_price") or 0) > 0}
    has_financials = {i["project_id"] for i in invoices} | {c["project_id"] for c in change_orders}
    has_inhouse = {t["project_id"] for t in transactions} | {s["project_id"] for s in sub_items}

    return [
        JobImportStatus(
            project_id=p["id"],
            project_name=p["name"],
            has_estimate=p["id"] in has_estimate,
            has_financials=p["id"] in has_financials,
            has_inhouse=p["id"] in has_inhouse,
        )
        for p in projects
    ]


@router.post("/{project_id}/estimate-sheet/preview", response_model=EstimateSheetPreview)
async def preview_estimate_sheet(
    project_id: str, file: UploadFile = File(...), _: CurrentUser = Depends(get_current_user)
):
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read that file: {e}") from e

    ws = _find_sheet(wb, "Estimate")
    if ws is None:
        raise HTTPException(status_code=400, detail="No sheet named 'Estimate' found in that file")

    existing_estimates, cost_codes = await asyncio.gather(
        db_get("estimates", f"?project_id=eq.{project_id}&order=version.desc&limit=1"),
        db_get("cost_codes", "?is_active=eq.true&select=id,code"),
    )
    codes_by_code = {c["code"].strip().lower(): c["id"] for c in cost_codes if c.get("code")}

    existing_estimate_id = None
    existing_keys: set = set()
    if existing_estimates:
        existing_estimate_id = existing_estimates[0]["id"]
        existing_items = await db_get(
            "estimate_line_items", f"?estimate_id=eq.{existing_estimate_id}&select=title,unit_cost"
        )
        existing_keys = {(i["title"], i["unit_cost"]) for i in existing_items}

    parsed = parse_estimate_sheet(ws, existing_keys)
    rows = []
    for row in parsed:
        code = row.get("cost_code")
        rows.append(
            EstimateSheetRow(
                **row,
                matched_cost_code_id=codes_by_code.get(code.lower()) if code else None,
            )
        )
    return EstimateSheetPreview(rows=rows, existing_estimate_id=existing_estimate_id)


@router.post("/{project_id}/inhouse-sheet/preview", response_model=InHouseSheetPreview)
async def preview_inhouse_sheet(
    project_id: str, file: UploadFile = File(...), _: CurrentUser = Depends(get_current_user)
):
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read that file: {e}") from e

    qb_ws = _find_sheet(wb, "Quickbooks")
    contractors_ws = _find_sheet(wb, "Contractors")
    if qb_ws is None and contractors_ws is None:
        raise HTTPException(
            status_code=400, detail="No sheet named 'Quickbooks' or 'Contractors' found in that file"
        )

    existing_tx, cost_codes, subcontractors = await asyncio.gather(
        db_get("transactions", f"?project_id=eq.{project_id}&select=transaction_date,amount,description"),
        db_get("cost_codes", "?is_active=eq.true&select=id,code"),
        db_get("subcontractors", "?select=id,company_name"),
    )
    codes_by_code = {c["code"].strip().lower(): c["id"] for c in cost_codes if c.get("code")}
    subs_by_name = {s["company_name"].strip().lower(): s["id"] for s in subcontractors if s.get("company_name")}
    existing_tx_keys = {
        (t["transaction_date"][:10], round(t["amount"], 2), (t.get("description") or "")[:60]) for t in existing_tx
    }

    transactions: list[TransactionSheetRow] = []
    if qb_ws is not None:
        parsed_tx = parse_quickbooks_sheet(qb_ws, existing_tx_keys)
        for row in parsed_tx:
            code = row.get("cost_code")
            transactions.append(
                TransactionSheetRow(**row, matched_cost_code_id=codes_by_code.get(code.lower()) if code else None)
            )

    contractors: list[ContractorBlock] = []
    if contractors_ws is not None:
        parsed_blocks = parse_contractors_sheet(contractors_ws)
        for block in parsed_blocks:
            contractors.append(
                ContractorBlock(
                    **block,
                    matched_subcontractor_id=subs_by_name.get(block["subcontractor_name"].strip().lower()),
                )
            )

    return InHouseSheetPreview(transactions=transactions, contractors=contractors)
