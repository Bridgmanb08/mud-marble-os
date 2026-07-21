from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..report_spec import ReportSpec, SOURCE_CONFIG, SpecValidationError, validate_spec
from ..schemas.reports import ReportCreate, ReportOut, ReportRunResult
from ..supabase_client import db_delete, db_get, db_post

router = APIRouter(prefix="/reports", tags=["reports"])


def _group_key(row: dict, source: str, group_by: str) -> str:
    config = SOURCE_CONFIG[source]
    if group_by == "month":
        raw = row.get(config["date_field"]) or ""
        return raw[:7] if len(raw) >= 7 else "Unknown"
    if group_by == "project":
        proj = row.get("projects") or {}
        name = proj.get("name") or "No project"
        return name.split("|")[0].strip()
    if group_by == "cost_code":
        cc = row.get("cost_codes") or {}
        return f"{cc['code']} - {cc['name']}" if cc.get("code") else "Uncoded"
    val = row.get(group_by)
    return str(val) if val not in (None, "") else "Unknown"


def _build_query(spec: ReportSpec) -> str:
    config = SOURCE_CONFIG[spec.source]
    query = f"?select={config['select']}&limit=2000"
    for f in spec.filters:
        value = f.value
        if isinstance(value, bool):
            value = str(value).lower()
        if f.op == "contains":
            query += f"&{f.field}=ilike.*{value}*"
        else:
            query += f"&{f.field}={f.op}.{value}"
    return query


async def _run(spec: ReportSpec) -> tuple[list[dict], int]:
    config = SOURCE_CONFIG[spec.source]
    rows = await db_get(config["table"], _build_query(spec))

    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        buckets[_group_key(r, spec.source, spec.group_by)].append(r)

    out = []
    for key, group_rows in buckets.items():
        if spec.aggregation == "count":
            value = len(group_rows)
        else:
            total = sum((r.get(spec.aggregation_field) or 0) for r in group_rows)
            value = round(total / len(group_rows), 2) if spec.aggregation == "avg" and group_rows else round(total, 2)
        out.append({"group": key, "value": value, "count": len(group_rows)})
    out.sort(key=lambda x: x["value"], reverse=True)
    return out, len(rows)


@router.post("/run", response_model=ReportRunResult)
async def run_report(spec: ReportSpec, _: CurrentUser = Depends(get_current_user)):
    try:
        validate_spec(spec)
    except SpecValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    rows, total = await _run(spec)
    return {"rows": rows, "total_rows": total}


@router.get("", response_model=list[ReportOut])
async def list_reports(current_user: CurrentUser = Depends(get_current_user)):
    return await db_get("saved_reports", f"?user_id=eq.{current_user.id}&order=created_at.desc")


@router.post("", response_model=ReportOut)
async def create_report(body: ReportCreate, current_user: CurrentUser = Depends(get_current_user)):
    try:
        validate_spec(ReportSpec(**body.spec))
    except SpecValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    rows = await db_post("saved_reports", {"user_id": current_user.id, "name": body.name, "spec": body.spec})
    return rows[0]


@router.delete("/{report_id}")
async def delete_report(report_id: str, current_user: CurrentUser = Depends(get_current_user)):
    rows = await db_get("saved_reports", f"?id=eq.{report_id}&select=user_id")
    if not rows or rows[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db_delete("saved_reports", report_id)
    return {"ok": True}
