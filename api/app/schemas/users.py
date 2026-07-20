from pydantic import BaseModel


class UserSummary(BaseModel):
    id: str
    name: str
    email: str
    role: str


class UserDirectoryEntry(BaseModel):
    id: str
    name: str
