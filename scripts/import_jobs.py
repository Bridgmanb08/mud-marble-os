"""Seed starter project rows from the job names visible in Brent's BuilderTrend screenshot.

This is a partial list (the screenshot was scrolled/cut off) — it seeds a handful of real
jobs, not a full export of BuilderTrend's job roster. Skips anything that already exists
by name, and skips the three entries that look like internal containers rather than real
jobs ("001 Megan's To Do's", "001 Sales Leads", "001 Shannon Ingram").

Run this yourself. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in your shell.

Usage:
    cd api && source .venv/bin/activate
    python ../scripts/import_jobs.py
"""

import os
import sys

import httpx

JOB_NAMES = [
    "224 N Summit | Jeremy and Bethany Hampton",
    "237 N Summit | Jon and Ashley Lough",
    "253 Williams Lane | Ben & Ashley Hardy",
    "4040 N Park Ave | Jenny & Billy Holland",
    "4409 N Pennsylvania | Jake and Maddie Miller",
    "4627 Broadway | Chuck Day",
    "546 E 38th St- Full Rehab Fire Units 14-17",
    "546 E 38th St- Unit 01",
    "546 E 38th St- Unit 02",
    "546 E 38th St- Unit 03",
    "546 E 38th St- Unit 04",
    "546 E 38th St- Unit 05",
    "546 E 38th St- Unit 06",
    "546 E 38th St- Unit 07",
    "546 E 38th St- Unit 08",
    "5756 Norwaldo Ave | Bria Kartholl",
    "5802 Guilford Ave | Peter and Teresa Leenhouts",
    "5860 Washington Ave | Gabrielle and Roger",
]


def address_from_name(name: str) -> str:
    if "|" in name:
        return name.split("|")[0].strip()
    if "-" in name:
        return name.split("-")[0].strip()
    return name


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

    existing = httpx.get(f"{supabase_url}/rest/v1/projects?select=name", headers=headers)
    if not existing.is_success:
        print(f"Failed to read existing projects: {existing.status_code} {existing.text}", file=sys.stderr)
        sys.exit(1)
    existing_names = {p["name"] for p in existing.json()}

    created, skipped = 0, 0
    for name in JOB_NAMES:
        if name in existing_names:
            skipped += 1
            continue
        r = httpx.post(
            f"{supabase_url}/rest/v1/projects",
            headers=headers,
            json={
                "name": name,
                "address": address_from_name(name),
                "city": "Indianapolis",
                "state": "IN",
                "status": "lead",
            },
        )
        if not r.is_success:
            print(f"Failed to create '{name}': {r.status_code} {r.text}", file=sys.stderr)
            continue
        created += 1
        print(f"Created: {name}")

    print(f"\nDone. Created {created}, skipped {skipped} (already existed).")


if __name__ == "__main__":
    main()
