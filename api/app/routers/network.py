"""Brent's personal relationship map: who connected him to whom, with
cross-connections since a person can be reached through more than one path.
The graph's shape lives entirely in network_connections edges -- a person
row carries no parent/child pointer of its own, so the frontend's force
graph can freely support "person A introduces C, C introduces D/G/H, H
introduces I/J/K" chains plus a person reachable via two different
introducers at once.

Kept as plain simple-shaped REST endpoints (not folded into some bespoke
"graph" verb) on purpose -- Brent's mentioned wanting a future Hermes agent
integration to write into this data too, and a REST CRUD surface is the
easiest thing for another agent to call correctly."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..schemas.network import (
    NetworkConnectionCreate,
    NetworkConnectionOut,
    NetworkGraphOut,
    NetworkPersonCreate,
    NetworkPersonOut,
    NetworkPersonUpdate,
)
from ..supabase_client import db_delete, db_get, db_patch, db_post

router = APIRouter(prefix="/network", tags=["network"])


@router.get("/graph", response_model=NetworkGraphOut)
async def get_graph(_: CurrentUser = Depends(get_current_user)):
    """Everything the graph page needs in one round trip -- every node and
    every edge. Cheap enough as a single fetch for a personal contact list;
    this isn't meant to scale to thousands of people."""
    people = await db_get("network_people", "?order=created_at.asc")
    connections = await db_get("network_connections", "?order=created_at.asc")
    return {"people": people, "connections": connections}


@router.post("/people", response_model=NetworkPersonOut)
async def create_person(body: NetworkPersonCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("network_people", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/people/{person_id}", response_model=NetworkPersonOut)
async def update_person(person_id: str, body: NetworkPersonUpdate, _: CurrentUser = Depends(get_current_user)):
    # exclude_unset (not exclude_none) -- clearing a note or phone number to
    # blank needs the explicit null to actually reach the database, the same
    # convention every other PATCH endpoint in this app follows.
    rows = await db_patch("network_people", person_id, body.model_dump(exclude_unset=True))
    if not rows:
        raise HTTPException(status_code=404, detail="Person not found")
    return rows[0]


@router.delete("/people/{person_id}")
async def delete_person(person_id: str, _: CurrentUser = Depends(get_current_user)):
    existing = await db_get("network_people", f"?id=eq.{person_id}&select=is_root")
    if not existing:
        raise HTTPException(status_code=404, detail="Person not found")
    if existing[0]["is_root"]:
        raise HTTPException(status_code=400, detail="Can't delete the root \"Me\" node.")
    # Connections into/out of this person cascade-delete at the DB level
    # (network_connections has ON DELETE CASCADE on both FKs), so the graph
    # just loses this node and its edges cleanly rather than leaving
    # dangling edges the frontend would have to defensively filter out.
    await db_delete("network_people", person_id)
    return {"ok": True}


@router.post("/connections", response_model=NetworkConnectionOut)
async def create_connection(body: NetworkConnectionCreate, _: CurrentUser = Depends(get_current_user)):
    if body.from_person_id == body.to_person_id:
        raise HTTPException(status_code=400, detail="A person can't connect to themselves.")
    existing = await db_get(
        "network_connections",
        f"?from_person_id=eq.{body.from_person_id}&to_person_id=eq.{body.to_person_id}",
    )
    if existing:
        raise HTTPException(status_code=400, detail="That connection already exists.")
    rows = await db_post(
        "network_connections",
        {"from_person_id": body.from_person_id, "to_person_id": body.to_person_id},
    )
    return rows[0]


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("network_connections", connection_id)
    return {"ok": True}
