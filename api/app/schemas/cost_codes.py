from typing import Optional

from pydantic import BaseModel


class CostCodeCreate(BaseModel):
    code: str
    name: str
    is_active: bool = True
    default_description: Optional[str] = None


class CostCodeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    default_description: Optional[str] = None


class CostCodeOut(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool
    default_description: Optional[str] = None
