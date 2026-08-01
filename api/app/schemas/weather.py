from typing import Optional

from pydantic import BaseModel


class DailyWeather(BaseModel):
    date: str
    condition: str
    high_f: float
    low_f: float
    precipitation_chance: Optional[int] = None


class WeatherOut(BaseModel):
    condition: str
    current_temp_f: float
    daily: list[DailyWeather]
