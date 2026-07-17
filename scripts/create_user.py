"""Create a login account in the app_users table.

Run this yourself (never share the password with anyone else, including an AI assistant).
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in your shell environment.

Usage:
    cd api && source .venv/bin/activate  # needs passlib[bcrypt] installed, see api/requirements.txt
    python ../scripts/create_user.py
"""

import getpass
import os
import sys

import httpx
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main() -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell first.", file=sys.stderr)
        sys.exit(1)

    name = input("Name: ").strip()
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match.", file=sys.stderr)
        sys.exit(1)

    password_hash = pwd_context.hash(password)

    r = httpx.post(
        f"{supabase_url}/rest/v1/app_users",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={"name": name, "email": email, "password_hash": password_hash},
    )
    if not r.is_success:
        print(f"Failed: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(1)

    print(f"Created user {email}.")


if __name__ == "__main__":
    main()
