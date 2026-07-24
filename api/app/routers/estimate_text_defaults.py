from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..estimate_text_defaults_store import get_or_create_estimate_text_defaults, update_estimate_text_defaults
from ..schemas.estimate_text_defaults import EstimateTextDefaultsOut, EstimateTextDefaultsUpdate

router = APIRouter(prefix="/estimate-text-defaults", tags=["estimate-text-defaults"])


@router.get("", response_model=EstimateTextDefaultsOut)
async def get_defaults(_: CurrentUser = Depends(get_current_user)):
    return await get_or_create_estimate_text_defaults()


@router.patch("", response_model=EstimateTextDefaultsOut)
async def update_defaults(body: EstimateTextDefaultsUpdate, _: CurrentUser = Depends(get_current_user)):
    return await update_estimate_text_defaults(body.model_dump(exclude_unset=True))
