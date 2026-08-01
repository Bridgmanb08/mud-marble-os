from fastapi import APIRouter, Depends

from ..deps import CurrentUser, get_current_user
from ..schemas.weather import WeatherOut
from ..weather_client import get_weather

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("", response_model=WeatherOut)
async def get_weather_endpoint(_: CurrentUser = Depends(get_current_user)):
    return await get_weather()
