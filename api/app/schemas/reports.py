from pydantic import BaseModel


class ReportCreate(BaseModel):
    name: str
    spec: dict


class ReportOut(BaseModel):
    id: str
    user_id: str
    name: str
    spec: dict
    created_at: str


class ReportRunRow(BaseModel):
    group: str
    value: float
    count: int


class ReportRunResult(BaseModel):
    rows: list[ReportRunRow]
    total_rows: int
