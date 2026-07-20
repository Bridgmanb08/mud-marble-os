from typing import Optional

from pydantic import BaseModel


class CostCodeCreate(BaseModel):
    code: str
    name: str
    is_active: bool = True


class CostCodeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None


class CostCodeOut(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool
