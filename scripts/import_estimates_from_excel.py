"""One-time import: creates (or activates) project rows for 4 new jobs and imports
each one's estimate from a BuilderTrend "Estimate Report" .xls export into a v1 draft
estimate.

This talks to the *real deployed app* (not Supabase directly), logging in with your own
account, so all the builder-cost/markup/total math goes through the same code the app
itself uses instead of a second hand-rolled copy of it. Your password only ever goes to
your own login endpoint — never shared with anyone else, including an AI assistant.

NOTE on 546 E 38th St: an earlier starter-data script (import_jobs.py) anticipated this
address might already be split into per-building/per-unit project rows in BuilderTrend
(a "Full Rehab" overview plus 8 individual units). This script checks for that — if it
finds more than one existing project matching "546 e 38th", it skips that one job and
prints what it found rather than guessing which project the consolidated estimate
belongs to. The other 3 jobs don't have this ambiguity.

Requires: pip install xlrd httpx   (xlrd reads the legacy .xls format; httpx is already
in api/requirements.txt)

Usage:
    cd api && source .venv/bin/activate && pip install xlrd
    python ../scripts/import_estimates_from_excel.py
"""

import getpass
import sys

import httpx
import xlrd

DEFAULT_BASE_URL = "https://project-n43cv.vercel.app"

JOBS = [
    {
        "address_match": "546 e 38th",
        "name": "546 E 38th St",
        "file": "/Users/brentbridgman/Desktop/546 e 38thEstimateReport.xls",
        "warn_multi_unit": True,
    },
    {
        "address_match": "237 n summit",
        "name": "237 N Summit",
        "file": "/Users/brentbridgman/Desktop/237 ummitEstimateReport.xls",
        "warn_multi_unit": False,
    },
    {
        "address_match": "253 williams",
        "name": "253 Williams Lane",
        "file": "/Users/brentbridgman/Desktop/253 williams lneEstimateReport.xls",
        "warn_multi_unit": False,
    },
    {
        "address_match": "5756 norwaldo",
        "name": "5756 Norwaldo Ave",
        "file": "/Users/brentbridgman/Desktop/5756 Norwaldo EstimateReport.xls",
        "warn_multi_unit": False,
    },
]


def bucket_for(category: str, title: str) -> str:
    if category.strip().upper().startswith("20 -"):
        return "allowance"
    if title.strip().lower() in {"pm fee", "project management fee"}:
        return "pm_fee"
    return "construction"


def parse_cost_code(raw: str):
    if not raw:
        return None
    if " - " in raw:
        return raw.split(" - ", 1)[0].strip()
    return raw.strip()


def main() -> None:
    base_url = input(f"App base URL [{DEFAULT_BASE_URL}]: ").strip() or DEFAULT_BASE_URL
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")

    client = httpx.Client(base_url=base_url, timeout=30)
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    if not login.is_success:
        print(f"Login failed: {login.status_code} {login.text}", file=sys.stderr)
        sys.exit(1)
    print(f"Logged in as {login.json().get('email')}")

    cost_codes = client.get("/api/transactions/cost-codes").json()
    codes_by_code = {c["code"].strip().lower(): c["id"] for c in cost_codes if c.get("code")}

    existing_projects = client.get("/api/projects", params={"include_archived": "true"}).json()

    unmatched = []

    for job in JOBS:
        print(f"\n=== {job['name']} ===")
        matches = [p for p in existing_projects if job["address_match"] in p["name"].lower()]

        if job["warn_multi_unit"] and len(matches) > 1:
            print(f"  Found {len(matches)} existing projects matching '{job['address_match']}' -- this address")
            print("  may already be split into per-unit projects. Skipping; tell me which project the")
            print("  consolidated estimate belongs to (or confirm this should be one job) and re-run.")
            for m in matches:
                print(f"    - {m['name']} (id={m['id']}, status={m['status']})")
            continue

        if len(matches) == 1:
            project = matches[0]
            print(f"  Using existing project: {project['name']} (id={project['id']}, status={project['status']})")
            if project["status"] != "active":
                client.patch(f"/api/projects/{project['id']}", json={"status": "active"})
                print("  -> set status to active")
        elif len(matches) == 0:
            r = client.post(
                "/api/projects",
                json={"name": job["name"], "address": job["name"], "city": "Indianapolis", "state": "IN", "status": "active"},
            )
            if not r.is_success:
                print(f"  FAILED to create project: {r.status_code} {r.text}", file=sys.stderr)
                continue
            project = r.json()
            print(f"  Created project: {project['name']} (id={project['id']})")
        else:
            print(f"  Found {len(matches)} ambiguous matches for '{job['address_match']}', skipping:")
            for m in matches:
                print(f"    - {m['name']} (id={m['id']})")
            continue

        existing_estimates = client.get("/api/estimates", params={"project_id": project["id"]}).json()
        existing_keys = set()
        if existing_estimates:
            estimate = existing_estimates[0]
            print(f"  Using existing estimate v{estimate['version']} (id={estimate['id']})")
            existing_items = client.get(f"/api/estimates/{estimate['id']}/items").json()
            # keyed on (title, unit_cost) rather than title alone -- some source spreadsheets
            # have two rows with the same title (e.g. separate "Framing" for exterior/interior)
            # but different costs, and title-only matching would wrongly treat them as one
            existing_keys = {(i["title"], i["unit_cost"]) for i in existing_items}
            if existing_keys:
                print(f"  {len(existing_keys)} line item(s) already on this estimate -- only adding what's missing.")
        else:
            est_r = client.post(
                "/api/estimates", json={"project_id": project["id"], "version": 1, "status": "draft", "pm_fee_total": 0}
            )
            if not est_r.is_success:
                print(f"  FAILED to create estimate: {est_r.status_code} {est_r.text}", file=sys.stderr)
                continue
            estimate = est_r.json()
            print(f"  Created estimate v1 (id={estimate['id']})")

        wb = xlrd.open_workbook(job["file"])
        sheet = wb.sheet_by_index(0)
        headers = [sheet.cell_value(0, c) for c in range(sheet.ncols)]
        col = {h: i for i, h in enumerate(headers)}

        def cell(row, name):
            i = col.get(name)
            if i is None:
                return None
            v = sheet.cell_value(row, i)
            return v if v != "" else None

        created, already_present = 0, 0
        for r in range(1, sheet.nrows):
            title = cell(r, "Title")
            if not title:
                continue
            unit_cost = float(cell(r, "Unit Cost") or 0)
            if (title, unit_cost) in existing_keys:
                already_present += 1
                continue
            category = cell(r, "Category") or ""
            raw_cost_code = cell(r, "Cost Code") or ""
            quantity = float(cell(r, "Quantity") or 1)
            markup_raw = float(cell(r, "Markup") or 0)
            markup_type_raw = cell(r, "Markup Type") or "%"
            description = cell(r, "Description")
            internal_notes = cell(r, "Internal Notes")

            if markup_type_raw == "%":
                markup_type, markup_value = "percent", markup_raw
            elif markup_type_raw == "$/unit":
                # our schema's flat markup is one total dollar amount, not per-unit -- scale by
                # quantity so the resulting profit matches what the source spreadsheet shows
                markup_type, markup_value = "flat", round(markup_raw * quantity, 2)
            else:
                markup_type, markup_value = "flat", markup_raw

            code = parse_cost_code(raw_cost_code)
            cost_code_id = codes_by_code.get(code.lower()) if code else None
            notes_internal = internal_notes or ""
            if raw_cost_code and not cost_code_id:
                notes_internal = f"{notes_internal}\n[Source cost code not matched: {raw_cost_code}]".strip()
                unmatched.append((job["name"], title, raw_cost_code))

            item_r = client.post(
                f"/api/estimates/{estimate['id']}/items",
                json={
                    "cost_code_id": cost_code_id,
                    "bucket": bucket_for(category, title),
                    "title": title,
                    "description": description,
                    "quantity": quantity,
                    "unit_cost": unit_cost,
                    "cost_type": "none",
                    "markup_type": markup_type,
                    "markup_value": markup_value,
                    "notes_external": description,
                    "notes_internal": notes_internal or None,
                },
            )
            if not item_r.is_success:
                print(f"  FAILED line item '{title}': {item_r.status_code} {item_r.text}", file=sys.stderr)
                continue
            created += 1

        skip_note = f" ({already_present} already present, skipped)" if already_present else ""
        print(f"  Imported {created} line items.{skip_note}")

    if unmatched:
        print("\n=== Line items whose source cost code didn't match your existing cost code list (noted on the item, not blocking) ===")
        for job_name, title, raw in unmatched:
            print(f"  {job_name} / {title}: '{raw}'")

    print("\nDone. Review each estimate in the app before sending anything to a client.")


if __name__ == "__main__":
    main()
