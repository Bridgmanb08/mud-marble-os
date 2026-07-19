from typing import Optional

from pydantic import BaseModel


class WidgetItem(BaseModel):
    id: str
    visible: bool = True


class LayoutOut(BaseModel):
    widgets: list[WidgetItem]


class LayoutUpdate(BaseModel):
    user_id: Optional[str] = None
    widgets: list[WidgetItem]
