from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.leads import LeadConvertRequest, LeadConvertResponse, LeadCreate, LeadOut, LeadUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/leads", tags=["leads"])


async def _attach_referrers(rows: list[dict]) -> list[dict]:
    referrer_ids = {r["referred_by_client_id"] for r in rows if r.get("referred_by_client_id")}
    if not referrer_ids:
        for r in rows:
            r["referred_by"] = None
        return rows
    id_filter = ",".join(referrer_ids)
    referrers = await db_get("clients", f"?id=in.({id_filter})&select=id,first_name,last_name")
    by_id = {r["id"]: r for r in referrers}
    for r in rows:
        r["referred_by"] = by_id.get(r.get("referred_by_client_id"))
    return rows


@router.get("", response_model=list[LeadOut])
async def list_leads(_: CurrentUser = Depends(get_current_user)):
    rows = await db_get("leads", "?order=created_at.desc")
    return await _attach_referrers(rows)


@router.post("", response_model=LeadOut)
async def create_lead(body: LeadCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("leads", body.model_dump(exclude_none=True))
    return (await _attach_referrers(rows))[0]


@router.patch("/{lead_id}", response_model=LeadOut)
async def update_lead(lead_id: str, body: LeadUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("leads", lead_id, body.model_dump(exclude_none=True))
    return (await _attach_referrers(rows))[0]


@router.post("/{lead_id}/convert", response_model=LeadConvertResponse)
async def convert_lead(lead_id: str, body: LeadConvertRequest, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("leads", f"?id=eq.{lead_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = rows[0]
    if lead.get("converted_client_id"):
        raise HTTPException(status_code=400, detail="This lead has already been converted")

    first_name = body.first_name or lead.get("first_name")
    last_name = body.last_name or lead.get("last_name")
    if not first_name and not last_name:
        raise HTTPException(status_code=400, detail="A first or last name is required to convert this lead")

    client_payload = {
        "first_name": first_name or last_name,
        "last_name": last_name if first_name else None,
        "phone": body.phone or lead.get("phone"),
        "email": body.email or lead.get("email"),
        "address": body.address or lead.get("project_address"),
        "referred_by_client_id": body.referred_by_client_id or lead.get("referred_by_client_id"),
        "referral_name": body.referral_name or lead.get("referral_name"),
    }
    client_rows = await db_post("clients", {k: v for k, v in client_payload.items() if v is not None})
    client = client_rows[0]

    project_name = (
        body.project_name
        or lead.get("title")
        or " ".join(filter(None, [first_name, last_name])).strip()
        or lead.get("project_address")
        or "New project"
    )
    project_payload = {
        "name": project_name,
        "address": lead.get("project_address"),
        "project_type": body.project_type or lead.get("project_type"),
        "status": "lead",
        "client_id": client["id"],
    }
    project_rows = await db_post("projects", {k: v for k, v in project_payload.items() if v is not None})
    project = project_rows[0]

    await db_patch(
        "leads",
        lead_id,
        {"status": "converted", "converted_client_id": client["id"], "converted_project_id": project["id"]},
    )

    return LeadConvertResponse(client_id=client["id"], project_id=project["id"])
