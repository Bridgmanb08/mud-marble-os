from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import HTTPException

from .schemas.weather import DailyWeather, WeatherOut

# Every job site is within a few miles of downtown Indianapolis, so weather is
# fetched for one fixed location rather than per-project -- no geocoding needed.
LAT, LON = 39.7684, -86.1581

CACHE_TTL_SECONDS = 20 * 60

_client: Optional[httpx.AsyncClient] = None
_cache: Optional[WeatherOut] = None
_cache_at: Optional[datetime] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15)
    return _client


def _condition_for_code(code: int) -> str:
    if code == 0:
        return "clear"
    if code in (1, 2, 3):
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (95, 96, 99):
        return "thunderstorm"
    return "cloudy"


async def get_weather() -> WeatherOut:
    """Returns the cached forecast if it's less than CACHE_TTL_SECONDS old --
    weather doesn't change minute to minute, and this avoids hammering
    Open-Meteo every time someone loads the dashboard or schedule."""
    global _cache, _cache_at
    now = datetime.now(timezone.utc)
    if _cache is not None and _cache_at is not None and (now - _cache_at).total_seconds() < CACHE_TTL_SECONDS:
        return _cache

    client = _get_client()
    try:
        r = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": LAT,
                "longitude": LON,
                "current": "weather_code,temperature_2m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                "timezone": "auto",
                "temperature_unit": "fahrenheit",
                "forecast_days": 16,
            },
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach weather service: {exc}") from exc
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Weather service error: {r.text}")

    data = r.json()
    current = data["current"]
    daily = data["daily"]
    result = WeatherOut(
        condition=_condition_for_code(current["weather_code"]),
        current_temp_f=current["temperature_2m"],
        daily=[
            DailyWeather(
                date=daily["time"][i],
                condition=_condition_for_code(daily["weather_code"][i]),
                high_f=daily["temperature_2m_max"][i],
                low_f=daily["temperature_2m_min"][i],
                precipitation_chance=daily["precipitation_probability_max"][i],
            )
            for i in range(len(daily["time"]))
        ],
    )
    _cache = result
    _cache_at = now
    return result
