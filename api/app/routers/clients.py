from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.clients import ClientBrief, ClientCreate, ClientOut, ClientProjectSummary, ClientUpdate
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


async def _attach_lifetime_values(rows: list[dict]) -> list[dict]:
    # lifetime_value is computed live from actual paid invoices across a
    # client's projects rather than a manually-maintained number -- the
    # stored column is never written to, so this is the only thing that
    # makes the field mean anything.
    client_ids = [r["id"] for r in rows]
    if not client_ids:
        return rows
    id_filter = ",".join(client_ids)
    projects = await db_get("projects", f"?client_id=in.({id_filter})&select=id,client_id")
    totals = {cid: 0.0 for cid in client_ids}
    if projects:
        project_to_client = {p["id"]: p["client_id"] for p in projects}
        pid_filter = ",".join(project_to_client.keys())
        invoices = await db_get("invoices", f"?project_id=in.({pid_filter})&select=project_id,amount_paid")
        for inv in invoices:
            cid = project_to_client.get(inv["project_id"])
            if cid:
                totals[cid] = totals.get(cid, 0.0) + (inv.get("amount_paid") or 0)
    for r in rows:
        r["lifetime_value"] = round(totals.get(r["id"], 0.0), 2)
    return rows


@router.get("", response_model=list[ClientOut])
async def list_clients(_: CurrentUser = Depends(get_current_user)):
    rows = await db_get("clients", "?order=last_name.asc")
    rows = await _attach_referrers(rows)
    return await _attach_lifetime_values(rows)


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

    return (await _attach_lifetime_values([client]))[0]


@router.post("", response_model=ClientOut)
async def create_client(body: ClientCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("clients", body.model_dump(exclude_none=True))
    created = (await _attach_referrers(rows))[0]
    created["referred"] = []
    return (await _attach_lifetime_values([created]))[0]


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
    return (await _attach_lifetime_values([updated]))[0]


@router.get("/{client_id}/projects", response_model=list[ClientProjectSummary])
async def get_client_projects(client_id: str, _: CurrentUser = Depends(get_current_user)):
    projects = await db_get(
        "projects", f"?client_id=eq.{client_id}&select=id,name,status,contract_value&order=created_at.desc"
    )
    if not projects:
        return []

    project_ids = [p["id"] for p in projects]
    pid_filter = ",".join(project_ids)
    invoices = await db_get("invoices", f"?project_id=in.({pid_filter})&select=project_id,amount_due,amount_paid")

    invoiced_by_project: dict = defaultdict(float)
    paid_by_project: dict = defaultdict(float)
    for inv in invoices:
        invoiced_by_project[inv["project_id"]] += inv.get("amount_due") or 0
        paid_by_project[inv["project_id"]] += inv.get("amount_paid") or 0

    return [
        ClientProjectSummary(
            id=p["id"],
            name=p["name"],
            status=p["status"],
            contract_value=p.get("contract_value"),
            invoiced_total=round(invoiced_by_project.get(p["id"], 0.0), 2),
            paid_total=round(paid_by_project.get(p["id"], 0.0), 2),
        )
        for p in projects
    ]
