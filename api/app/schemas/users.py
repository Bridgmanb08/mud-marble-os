from pydantic import BaseModel


class UserSummary(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_admin: bool = False


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"
    is_admin: bool = False


class UserDirectoryEntry(BaseModel):
    id: str
    name: str
