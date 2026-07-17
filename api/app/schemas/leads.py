from typing import Optional

from pydantic import BaseModel


class LeadCreate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    project_address: Optional[str] = None
    project_type: Optional[str] = None
    how_heard: Optional[str] = None
    budget_range_min: Optional[float] = None
    budget_range_max: Optional[float] = None
    estimated_revenue_min: Optional[float] = None
    estimated_revenue_max: Optional[float] = None
    confidence: Optional[int] = None
    referral_name: Optional[str] = None
    funding_type: Optional[str] = None
    vetting_score: Optional[int] = None
    notes: Optional[str] = None
    status: str = "new"


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    project_address: Optional[str] = None
    project_type: Optional[str] = None
    budget_range_min: Optional[float] = None
    budget_range_max: Optional[float] = None
    estimated_revenue_min: Optional[float] = None
    estimated_revenue_max: Optional[float] = None
    confidence: Optional[int] = None
    referral_name: Optional[str] = None
    last_contacted_at: Optional[str] = None
    status: Optional[str] = None


class LeadOut(LeadCreate):
    id: str
    created_at: str
    last_contacted_at: Optional[str] = None
