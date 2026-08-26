from typing import Optional

from pydantic import BaseModel


class UserSummary(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_admin: bool = False
    hide_rental_financials: bool = False


class UserUpdate(BaseModel):
    hide_rental_financials: Optional[bool] = None


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"
    is_admin: bool = False


class PasswordReset(BaseModel):
    password: str


class UserDirectoryEntry(BaseModel):
    id: str
    name: str


class UserPreferences(BaseModel):
    quick_task_widget_enabled: bool = False


class UserPreferencesUpdate(BaseModel):
    quick_task_widget_enabled: Optional[bool] = None
