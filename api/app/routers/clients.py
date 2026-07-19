from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.clients import ClientCreate, ClientOut, ClientUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
async def list_clients(_: CurrentUser = Depends(get_current_user)):
    return await db_get("clients", "?order=last_name.asc")


@router.post("", response_model=ClientOut)
async def create_client(body: ClientCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("clients", body.model_dump(exclude_none=True))
    return rows[0]


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, body: ClientUpdate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_patch("clients", client_id, body.model_dump(exclude_none=True))
    return rows[0]
