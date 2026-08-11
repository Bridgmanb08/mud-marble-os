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
    estimate_copilot,
    estimate_templates,
    estimate_text_defaults,
    estimates,
    files,
    invoices,
    job_import,
    lead_stages,
    leads,
    messages,
    notification_settings,
    notifications,
    person_tags,
    project_subcontractor_items,
    projects,
    pulse,
    quick_reminders,
    rental_files,
    rental_leases,
    rental_properties,
    rental_tenants,
    rental_work_orders,
    rentals_dashboard,
    rent_roll,
    reports,
    smart_nudges,
    sub_intelligence,
    subcontractor_files,
    subcontractors,
    tasks,
    transactions,
    twilio_sms,
    users,
    weather,
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
app.include_router(estimate_text_defaults.router, prefix="/api")
app.include_router(estimate_copilot.router, prefix="/api")
app.include_router(estimate_templates.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(change_orders.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(subcontractors.router, prefix="/api")
app.include_router(subcontractor_files.router, prefix="/api")
app.include_router(sub_intelligence.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(quick_reminders.router, prefix="/api")
app.include_router(twilio_sms.router, prefix="/api")
app.include_router(person_tags.router, prefix="/api")
app.include_router(lead_stages.router, prefix="/api")
app.include_router(pulse.router, prefix="/api")
app.include_router(notification_settings.router, prefix="/api")
app.include_router(smart_nudges.router, prefix="/api")
app.include_router(weather.router, prefix="/api")
app.include_router(job_import.router, prefix="/api")
app.include_router(rental_properties.router, prefix="/api")
app.include_router(rental_tenants.router, prefix="/api")
app.include_router(rental_leases.router, prefix="/api")
app.include_router(rental_work_orders.router, prefix="/api")
app.include_router(rental_files.router, prefix="/api")
app.include_router(rentals_dashboard.router, prefix="/api")
app.include_router(rent_roll.router, prefix="/api")
