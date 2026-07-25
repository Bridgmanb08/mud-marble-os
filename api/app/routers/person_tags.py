import urllib.parse

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user, require_admin
from ..schemas.person_tags import PersonTagCreate, PersonTagLinkCreate, PersonTagLinkOut, PersonTagOut, PersonTagUpdate
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/person-tags", tags=["person-tags"])

VALID_ENTITY_TYPES = ("client", "subcontractor", "lead")


@router.get("", response_model=list[PersonTagOut])
async def list_tags(_: CurrentUser = Depends(get_current_user)):
    return await db_get("person_tags", "?order=label.asc&limit=500")


@router.post("", response_model=PersonTagOut)
async def create_tag(body: PersonTagCreate, _: CurrentUser = Depends(require_admin)):
    rows = await db_post("person_tags", body.model_dump())
    return rows[0]


@router.patch("/{tag_id}", response_model=PersonTagOut)
async def update_tag(tag_id: str, body: PersonTagUpdate, _: CurrentUser = Depends(require_admin)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    rows = await db_patch("person_tags", tag_id, updates)
    if not rows:
        raise HTTPException(status_code=404, detail="Tag not found")
    return rows[0]


@router.delete("/{tag_id}")
async def delete_tag(tag_id: str, _: CurrentUser = Depends(require_admin)):
    await db_delete("person_tags", tag_id)
    return {"ok": True}


@router.post("/{tag_id}/attach", response_model=PersonTagLinkOut)
async def attach_tag(tag_id: str, body: PersonTagLinkCreate, _: CurrentUser = Depends(get_current_user)):
    if body.entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of {VALID_ENTITY_TYPES}")
    # No FK check ties entity_id back to a real row -- person_tag_links is polymorphic
    # across three unrelated tables, so there's no single column to FK against. Low
    # risk since only authenticated app users can call this, not untrusted input.
    rows = await db_post("person_tag_links", {"tag_id": tag_id, **body.model_dump()})
    return rows[0]


@router.delete("/{tag_id}/detach")
async def detach_tag(tag_id: str, entity_type: str, entity_id: str, _: CurrentUser = Depends(get_current_user)):
    entity_type_q = urllib.parse.quote(entity_type, safe="")
    entity_id_q = urllib.parse.quote(entity_id, safe="")
    links = await db_get(
        "person_tag_links",
        f"?tag_id=eq.{tag_id}&entity_type=eq.{entity_type_q}&entity_id=eq.{entity_id_q}&select=id",
    )
    for link in links:
        await db_delete("person_tag_links", link["id"])
    return {"ok": True}


@router.get("/for/{entity_type}/{entity_id}", response_model=list[PersonTagOut])
async def tags_for_entity(entity_type: str, entity_id: str, _: CurrentUser = Depends(get_current_user)):
    links = await db_get("person_tag_links", f"?entity_type=eq.{entity_type}&entity_id=eq.{entity_id}&select=tag_id")
    if not links:
        return []
    ids = ",".join(link["tag_id"] for link in links)
    return await db_get("person_tags", f"?id=in.({ids})")
