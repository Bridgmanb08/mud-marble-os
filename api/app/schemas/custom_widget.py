from pydantic import BaseModel

from ..custom_widget_spec import CustomWidgetSpec


class CreateCustomWidgetRequest(BaseModel):
    prompt: str


class CustomWidgetOut(BaseModel):
    id: str
    title: str
    spec: CustomWidgetSpec
