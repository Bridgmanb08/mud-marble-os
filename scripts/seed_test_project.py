"""Seed a fully fabricated test project — client, estimate, invoices, change orders,
transactions, and a task board with dependencies/subtasks/comments — so every page in
the app has real, connected data to exercise.

Everything created is clearly marked "TEST QA —" in its name so it's easy to find and
never mistaken for a real client's job. Re-running is safe (it's idempotent: it checks
for the marker project first and skips creation if it already exists).

Run this yourself. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in your shell.

Usage:
    cd api && source .venv/bin/activate
    python ../scripts/seed_test_project.py            # create the test project
    python ../scripts/seed_test_project.py --cleanup  # delete it and everything under it
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

import httpx

PROJECT_NAME = "TEST QA — 512 E Test Ave | Jordan and Casey Whitfield"
CLIENT_MARKER_EMAIL = "jordan.whitfield.testqa@example.com"

NOW = datetime.now(timezone.utc)


def day(offset: int) -> str:
    return (NOW + timedelta(days=offset)).date().isoformat()


def ts(hours: int) -> str:
    return (NOW + timedelta(hours=hours)).isoformat()


def main() -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell first.", file=sys.stderr)
        sys.exit(1)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    base = f"{supabase_url}/rest/v1"

    def get(table: str, query: str = "") -> list[dict]:
        r = httpx.get(f"{base}/{table}{query}", headers=headers, timeout=20)
        if not r.is_success:
            print(f"GET {table} failed: {r.status_code} {r.text}", file=sys.stderr)
            sys.exit(1)
        return r.json()

    def post(table: str, data: dict) -> dict:
        r = httpx.post(f"{base}/{table}", headers=headers, json=data, timeout=20)
        if not r.is_success:
            print(f"POST {table} failed: {r.status_code} {r.text}", file=sys.stderr)
            sys.exit(1)
        return r.json()[0]

    def delete(table: str, query: str) -> None:
        r = httpx.delete(f"{base}/{table}{query}", headers=headers, timeout=20)
        if not r.is_success:
            print(f"DELETE {table} failed: {r.status_code} {r.text}", file=sys.stderr)

    existing = get("projects", f"?name=eq.{quote(PROJECT_NAME, safe='')}&select=id")

    if "--cleanup" in sys.argv:
        if not existing:
            print("No test project found — nothing to clean up.")
            return
        project_id = existing[0]["id"]
        confirm = input(f"Delete test project {project_id} and everything under it? (y/N): ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

        tasks = get("schedule_items", f"?project_id=eq.{project_id}&select=id")
        task_ids = ",".join(t["id"] for t in tasks)
        if task_ids:
            delete("task_comments", f"?task_id=in.({task_ids})")
            delete("task_dependencies", f"?task_id=in.({task_ids})")
            delete("task_dependencies", f"?depends_on_id=in.({task_ids})")
            delete("task_subtasks", f"?task_id=in.({task_ids})")
        delete("schedule_items", f"?project_id=eq.{project_id}")

        estimates = get("estimates", f"?project_id=eq.{project_id}&select=id")
        for e in estimates:
            delete("estimate_line_items", f"?estimate_id=eq.{e['id']}")
        delete("estimates", f"?project_id=eq.{project_id}")

        delete("invoices", f"?project_id=eq.{project_id}")
        delete("change_orders", f"?project_id=eq.{project_id}")
        delete("transactions", f"?project_id=eq.{project_id}")
        delete("project_notes", f"?project_id=eq.{project_id}")
        delete("projects", f"?id=eq.{project_id}")

        client = get("clients", f"?email=eq.{CLIENT_MARKER_EMAIL}&select=id")
        if client:
            delete("clients", f"?id=eq.{client[0]['id']}")

        print("Test project and all related data deleted.")
        return

    if existing:
        print(f"Test project already exists ({existing[0]['id']}). Run with --cleanup first if you want to reseed.")
        return

    print("Creating client...")
    client = post(
        "clients",
        {
            "first_name": "Jordan",
            "last_name": "Whitfield",
            "phone": "317-555-0142",
            "email": CLIENT_MARKER_EMAIL,
            "referral_name": "Dave Sparks",
            "funding_type": "cash",
            "preferred_contact_method": "text",
            "spouse_partner_name": "Casey Whitfield",
            "notes": "Fabricated QA test client — safe to delete.",
            "is_active": True,
        },
    )

    print("Creating project...")
    project = post(
        "projects",
        {
            "name": PROJECT_NAME,
            "address": "512 E Test Ave",
            "zip": "46220",
            "city": "Indianapolis",
            "state": "IN",
            "status": "active",
            "project_type": "Full renovation",
            "start_date": day(-45),
            "estimated_completion": day(75),
            "internal_notes": "Fabricated QA test project — safe to delete. Created by seed_test_project.py.",
            "contract_value": 185000,
            "client_id": client["id"],
        },
    )
    project_id = project["id"]

    print("Creating estimate + line items...")
    estimate = post(
        "estimates",
        {"project_id": project_id, "version": 1, "status": "approved", "pm_fee_total": 12000, "notes_internal": "QA test estimate"},
    )
    post(
        "estimate_line_items",
        {"estimate_id": estimate["id"], "bucket": "pm_fee", "description": "Project management fee", "builder_cost": 12000, "owner_price": 12000, "sort_order": 1},
    )
    construction_items = [
        ("Framing labor & materials", 9000, 5000, 0, 500, 20),
        ("Electrical rough-in", 4000, 2500, 3000, 300, 20),
        ("Plumbing rough-in", 3500, 2000, 4500, 300, 20),
        ("Drywall & paint", 6000, 3000, 0, 400, 18),
        ("Flooring installation", 2000, 6000, 0, 300, 18),
    ]
    for i, (desc, labor, material, sub, cont, markup_pct) in enumerate(construction_items, start=2):
        builder_cost = labor + material + sub + cont
        owner_price = round(builder_cost * (1 + markup_pct / 100))
        post(
            "estimate_line_items",
            {
                "estimate_id": estimate["id"],
                "bucket": "construction",
                "description": desc,
                "day_labor_cost": labor,
                "material_cost": material,
                "subcontractor_cost": sub,
                "contingency": cont,
                "builder_cost": builder_cost,
                "markup_type": "percent",
                "markup_value": markup_pct,
                "owner_price": owner_price,
                "sort_order": i,
            },
        )
    allowance_items = [("Kitchen cabinets allowance", 14000), ("Plumbing fixtures allowance", 4500)]
    for i, (desc, amt) in enumerate(allowance_items, start=len(construction_items) + 2):
        post(
            "estimate_line_items",
            {"estimate_id": estimate["id"], "bucket": "allowance", "description": desc, "builder_cost": amt, "owner_price": amt, "sort_order": i},
        )

    print("Creating invoices...")
    post("invoices", {"project_id": project_id, "invoice_number": "INV-1001", "invoice_type": "deposit", "amount_due": 37000, "amount_paid": 37000, "status": "paid", "due_date": day(-40), "issued_at": day(-45)})
    post("invoices", {"project_id": project_id, "invoice_number": "INV-1002", "invoice_type": "progress", "amount_due": 50000, "amount_paid": 50000, "status": "paid", "due_date": day(-15), "issued_at": day(-20)})
    post("invoices", {"project_id": project_id, "invoice_number": "INV-1003", "invoice_type": "progress", "amount_due": 45000, "status": "sent", "due_date": day(10), "issued_at": day(-2)})
    post("invoices", {"project_id": project_id, "invoice_number": "INV-1004", "invoice_type": "final", "amount_due": 53000, "status": "draft", "due_date": day(60), "issued_at": day(0)})

    print("Creating change orders...")
    post("change_orders", {"project_id": project_id, "co_number": 1, "title": "Add recessed lighting in kitchen", "co_type": "client_addition", "owner_price": 2200, "builder_cost": 1600, "status": "approved", "sent_at": ts(-20 * 24), "discovered_by": "client", "description": "Client requested 6 recessed cans over the island area."})
    post("change_orders", {"project_id": project_id, "co_number": 2, "title": "Unpermitted electrical panel found", "co_type": "unforeseen", "owner_price": 3500, "builder_cost": 2800, "status": "approved", "sent_at": ts(-12 * 24), "discovered_by": "inspector", "description": "Existing panel failed inspection, requires full replacement."})
    post("change_orders", {"project_id": project_id, "co_number": 3, "title": "Missed exterior grading in estimate", "co_type": "oversight", "owner_price": 1800, "builder_cost": 1400, "status": "sent", "sent_at": ts(-30), "discovered_by": "brent", "description": "Grading around the new addition wasn't scoped in the original estimate."})

    print("Creating transactions...")
    cost_codes = get("cost_codes", "?is_active=eq.true&select=id,code")

    def cost_code_for(prefix: str) -> Optional[str]:
        for c in cost_codes:
            if c["code"].startswith(prefix):
                return c["id"]
        return None

    txns = [
        (day(-42), "ABC Lumber", "expense", -8500, cost_code_for("05")),
        (day(-30), "Sparky Electric LLC", "expense", -6200, cost_code_for("08")),
        (day(-16), "Drywall Pros", "expense", -4800, cost_code_for("10")),
        (day(-45), None, "income", 37000, None),
        (day(-20), None, "income", 50000, None),
        (day(-10), None, "expense", -2200, None),
    ]
    for tx_date, vendor, tx_type, amount, cost_code_id in txns:
        post(
            "transactions",
            {
                "project_id": project_id,
                "transaction_date": tx_date,
                "vendor": vendor,
                "transaction_type": tx_type,
                "amount": amount,
                "cost_code_id": cost_code_id,
                "is_change_order": amount == -2200,
                "quickbooks_synced": tx_type == "income",
            },
        )

    print("Creating project notes...")
    post("project_notes", {"project_id": project_id, "author": "shannon", "note_type": "internal", "content": "Client confirmed cabinet color selection — white shaker.", "is_client_visible": False})
    post("project_notes", {"project_id": project_id, "author": "brent", "note_type": "client_update", "content": "Framing complete, electrical rough-in underway. On track for the original timeline.", "is_client_visible": True})

    print("Creating tasks...")
    task_defs = [
        ("Site prep & demo", "Alex", "complete", "normal", -45, -38, False),
        ("Framing", "Alex", "complete", "high", -37, -25, True),
        ("Electrical rough-in", "Alex", "in_progress", "high", -10, 2, False),
        ("Plumbing rough-in", "Alex", "upcoming", "high", 0, 5, False),
        ("Order kitchen cabinets", "Shannon", "delayed", "urgent", -20, -3, False),
        ("Drywall install", "Alex", "upcoming", "normal", 6, 12, False),
        ("Interior paint", "Alex", "upcoming", "normal", 13, 18, False),
        ("Flooring installation", "Alex", "upcoming", "normal", 19, 24, False),
        ("Client selections meeting", "Shannon", "complete", "normal", -40, -40, False),
        ("Final walkthrough", "Brent", "upcoming", "high", 70, 70, True),
    ]
    tasks_by_title: dict[str, dict] = {}
    for title, assigned_to, status, priority, start_off, end_off, milestone in task_defs:
        task = post(
            "schedule_items",
            {
                "project_id": project_id,
                "title": title,
                "assigned_to": assigned_to,
                "status": status,
                "priority": priority,
                "scheduled_start": day(start_off),
                "scheduled_end": day(end_off),
                "is_milestone": milestone,
            },
        )
        tasks_by_title[title] = task

    print("Creating task dependencies...")
    dependency_pairs = [
        ("Plumbing rough-in", "Electrical rough-in"),
        ("Drywall install", "Electrical rough-in"),
        ("Drywall install", "Plumbing rough-in"),
        ("Interior paint", "Drywall install"),
        ("Flooring installation", "Interior paint"),
        ("Final walkthrough", "Flooring installation"),
        ("Final walkthrough", "Order kitchen cabinets"),
    ]
    for task_title, depends_on_title in dependency_pairs:
        post(
            "task_dependencies",
            {"task_id": tasks_by_title[task_title]["id"], "depends_on_id": tasks_by_title[depends_on_title]["id"]},
        )

    print("Creating subtasks...")
    framing = tasks_by_title["Framing"]
    for sub_title, done in [("Frame exterior walls", True), ("Frame interior partitions", True), ("Install roof trusses", True), ("Remove temporary bracing", False)]:
        post("task_subtasks", {"task_id": framing["id"], "title": sub_title, "is_complete": done})
    electrical = tasks_by_title["Electrical rough-in"]
    for sub_title, done in [("Rough-in kitchen circuits", True), ("Rough-in bathroom circuits", False), ("Panel tie-in", False)]:
        post("task_subtasks", {"task_id": electrical["id"], "title": sub_title, "is_complete": done})

    print("Creating task comments...")
    post("task_comments", {"task_id": electrical["id"], "author": "Alex", "content": "Inspector scheduled for Friday morning."})
    post("task_comments", {"task_id": tasks_by_title["Order kitchen cabinets"]["id"], "author": "Shannon", "content": "Vendor says cabinets are backordered 3 weeks — flagging as delayed."})

    print(f"\nDone. Test project created: {project_id}")
    print(f"Name: {PROJECT_NAME}")
    print("Everything is tagged as a QA test — run with --cleanup to remove it all later.")


if __name__ == "__main__":
    main()
