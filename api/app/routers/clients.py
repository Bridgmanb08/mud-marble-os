from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.clients import ClientBrief, ClientCreate, ClientOut, ClientUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/clients", tags=["clients"])


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


@router.get("", response_model=list[ClientOut])
async def list_clients(_: CurrentUser = Depends(get_current_user)):
    rows = await db_get("clients", "?order=last_name.asc")
    return await _attach_referrers(rows)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(client_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("clients", f"?id=eq.{client_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Client not found")
    client = rows[0]

    if client.get("referred_by_client_id"):
        referrer_rows = await db_get(
            "clients", f"?id=eq.{client['referred_by_client_id']}&select=id,first_name,last_name"
        )
        client["referred_by"] = referrer_rows[0] if referrer_rows else None
    else:
        client["referred_by"] = None

    referred_rows = await db_get(
        "clients", f"?referred_by_client_id=eq.{client_id}&select=id,first_name,last_name&order=first_name.asc"
    )
    client["referred"] = [ClientBrief(**r) for r in referred_rows]

    return client


@router.post("", response_model=ClientOut)
async def create_client(body: ClientCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("clients", body.model_dump(exclude_none=True))
    created = (await _attach_referrers(rows))[0]
    created["referred"] = []
    return created


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, body: ClientUpdate, _: CurrentUser = Depends(get_current_user)):
    # exclude_unset (not exclude_none) -- the frontend sends an explicit null to
    # clear a field (e.g. unlinking a referral, blanking out a note), and that
    # has to reach the database. exclude_none would silently drop it instead.
    rows = await db_patch("clients", client_id, body.model_dump(exclude_unset=True))
    updated = (await _attach_referrers(rows))[0]
    referred_rows = await db_get(
        "clients", f"?referred_by_client_id=eq.{client_id}&select=id,first_name,last_name&order=first_name.asc"
    )
    updated["referred"] = [ClientBrief(**r) for r in referred_rows]
    return updated
