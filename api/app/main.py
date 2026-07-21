from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import (
    ai,
    auth,
    change_orders,
    clients,
    cost_codes,
    dashboard,
    estimates,
    files,
    invoices,
    leads,
    notifications,
    project_subcontractor_items,
    projects,
    quick_reminders,
    reports,
    sub_intelligence,
    subcontractor_files,
    subcontractors,
    tasks,
    transactions,
    users,
)

app = FastAPI(title="Mud & Marble OS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(project_subcontractor_items.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(cost_codes.router, prefix="/api")
app.include_router(estimates.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(change_orders.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(subcontractors.router, prefix="/api")
app.include_router(subcontractor_files.router, prefix="/api")
app.include_router(sub_intelligence.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(quick_reminders.router, prefix="/api")
