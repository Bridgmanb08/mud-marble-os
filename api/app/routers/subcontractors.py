from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..ai_provider import ProviderError, draft_sub_info_email
from ..deps import CurrentUser, get_current_user
from ..schemas.subcontractors import SubcontractorCreate, SubcontractorOut, SubcontractorUpdate, SubEmailDraftOut
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/subcontractors", tags=["subcontractors"])


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00")) if "T" in value else datetime.fromisoformat(value + "T00:00:00+00:00")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("", response_model=list[SubcontractorOut])
async def list_subcontractors(_: CurrentUser = Depends(get_current_user)):
    return await db_get("subcontractors", "?order=company_name.asc&select=*,sms_contacts(id,phone_number,name)")


@router.post("", response_model=SubcontractorOut)
async def create_subcontractor(body: SubcontractorCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("subcontractors", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/{subcontractor_id}", response_model=SubcontractorOut)
async def update_subcontractor(
    subcontractor_id: str, body: SubcontractorUpdate, _: CurrentUser = Depends(get_current_user)
):
    # exclude_unset (not exclude_none) -- a caller may need to explicitly
    # clear a field (e.g. removing an insurance_expiry or license_number),
    # and that null has to reach the database instead of being silently
    # dropped. Same fix already made for clients/projects/invoices/etc.
    rows = await db_patch("subcontractors", subcontractor_id, body.model_dump(exclude_unset=True))
    return rows[0]


@router.post("/{subcontractor_id}/draft-email", response_model=SubEmailDraftOut)
async def draft_email(subcontractor_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("subcontractors", f"?id=eq.{subcontractor_id}&select=*")
    if not rows:
        raise HTTPException(status_code=404, detail="Subcontractor not found")
    sub = rows[0]

    missing: list[str] = []
    if not sub.get("w9_on_file"):
        missing.append("a completed W9 form")
    exp = sub.get("insurance_expiry")
    if not exp:
        missing.append("a current certificate of insurance")
    else:
        now = datetime.now(timezone.utc)
        exp_dt = _parse_dt(exp)
        if exp_dt < now:
            missing.append("an updated certificate of insurance (their current one has expired)")
        elif exp_dt < now + timedelta(days=30):
            missing.append("an updated certificate of insurance (theirs expires soon)")
    if not missing:
        missing.append("a quick confirmation that their file (W9, insurance, license) is still current")

    try:
        draft = await draft_sub_info_email(
            company_name=sub["company_name"],
            contact_name=sub.get("contact_name"),
            trade=sub.get("trade"),
            missing_items=missing,
        )
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return SubEmailDraftOut(subject=draft.subject, body=draft.body, to_email=sub.get("email"))
