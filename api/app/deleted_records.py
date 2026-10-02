"""Recently deleted: a full copy of an estimate and its line items is saved
before a hard delete, and can be restored with the same ids for RETENTION_DAYS
afterward. The copy is written BEFORE anything is removed, and the delete is
abandoned if the copy can't be saved -- a delete never goes through without a
way back."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from .supabase_client import db_delete, db_delete_query, db_get, db_patch_query, db_post, db_post_many

TABLE = "deleted_records"
RETENTION_DAYS = 90
LIST_SELECT = "id,kind,original_id,project_id,label,summary,deleted_by,deleted_at"


async def snapshot_estimate(estimate_id: str, deleted_by: Optional[str]) -> None:
    estimates = await db_get("estimates", f"?id=eq.{estimate_id}&select=*,projects(name)")
    if not estimates:
        raise HTTPException(status_code=404, detail="Estimate not found")
    estimate = dict(estimates[0])
    project_name = ((estimate.pop("projects", None) or {}).get("name") or "").split("|")[0].strip()
    items = await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc")

    # project_subcontractor_items.source_line_item_id is ON DELETE SET NULL,
    # so deleting the line items quietly unlinks any sub item built from one.
    # Remember which links there were so a restore can put them back.
    sub_links: list[dict] = []
    if items:
        id_filter = ",".join(i["id"] for i in items)
        sub_links = await db_get(
            "project_subcontractor_items", f"?source_line_item_id=in.({id_filter})&select=id,source_line_item_id"
        )

    label = f"{project_name or estimate.get('title') or 'Estimate'} v{estimate.get('version')}"
    await db_post(
        TABLE,
        {
            "kind": "estimate",
            "original_id": estimate_id,
            "project_id": estimate.get("project_id"),
            "label": label,
            "summary": {
                "project_name": project_name,
                "title": estimate.get("title"),
                "version": estimate.get("version"),
                "status": estimate.get("status"),
                "grand_total_owner_price": estimate.get("grand_total_owner_price"),
                "item_count": len(items),
            },
            "payload": {"estimate": estimate, "items": items, "sub_links": sub_links},
            "deleted_by": deleted_by,
        },
    )


async def list_deleted(kind: str) -> list[dict]:
    # Expired copies are cleared out lazily, whenever the list is opened.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    await db_delete_query(TABLE, f"?deleted_at=lt.{cutoff}")
    return await db_get(TABLE, f"?kind=eq.{kind}&order=deleted_at.desc&select={LIST_SELECT}")


async def restore_estimate(record_id: str) -> dict:
    rows = await db_get(TABLE, f"?id=eq.{record_id}&kind=eq.estimate")
    if not rows:
        raise HTTPException(status_code=404, detail="That deleted estimate is no longer available.")
    payload = rows[0]["payload"]
    estimate = dict(payload["estimate"])
    items = payload.get("items") or []
    sub_links = payload.get("sub_links") or []
    estimate_id = estimate["id"]

    if not await db_get("projects", f"?id=eq.{estimate['project_id']}&select=id"):
        raise HTTPException(
            status_code=400,
            detail="The project this estimate belonged to no longer exists, so it can't be restored.",
        )
    if await db_get("estimates", f"?id=eq.{estimate_id}&select=id"):
        raise HTTPException(status_code=409, detail="This estimate already exists.")

    # A newer version may have taken this version number since the delete.
    siblings = await db_get("estimates", f"?project_id=eq.{estimate['project_id']}&select=version")
    taken = {s.get("version") for s in siblings}
    version_changed = estimate.get("version") in taken
    if version_changed:
        estimate["version"] = max((v for v in taken if v is not None), default=0) + 1

    await db_post("estimates", estimate)
    try:
        if items:
            await db_post_many("estimate_line_items", items)
    except HTTPException:
        await db_delete_query("estimate_line_items", f"?estimate_id=eq.{estimate_id}")
        await db_delete("estimates", estimate_id)
        raise

    for link in sub_links:
        # Best effort: only re-link a sub item that still exists and is
        # still unlinked; anything else is left as the person last set it.
        try:
            await db_patch_query(
                "project_subcontractor_items",
                f"?id=eq.{link['id']}&source_line_item_id=is.null",
                {"source_line_item_id": link["source_line_item_id"]},
            )
        except HTTPException:
            pass

    await db_delete(TABLE, record_id)
    return {
        "id": estimate_id,
        "project_id": estimate["project_id"],
        "version": estimate["version"],
        "version_changed": version_changed,
    }
