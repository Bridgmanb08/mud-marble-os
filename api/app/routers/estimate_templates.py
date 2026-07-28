from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..estimate_defaults import DEFAULT_CLOSING_TEXT
from ..schemas.estimate_templates import (
    ApplyTemplateRequest,
    EstimateTemplateCreate,
    EstimateTemplateOut,
    EstimateTemplateUpdate,
    SaveAsTemplateRequest,
    TemplateLineItemCreate,
    TemplateLineItemOut,
    TemplateLineItemUpdate,
)
from ..schemas.estimates import EstimateOut
from ..supabase_client import db_delete, db_get, db_patch, db_post, db_post_many
from .estimates import _compute_costs, _recalc_estimate_totals

router = APIRouter(prefix="/estimate-templates", tags=["estimate-templates"])


@router.get("", response_model=list[EstimateTemplateOut])
async def list_templates(_: CurrentUser = Depends(get_current_user)):
    return await db_get("estimate_templates", "?order=created_at.desc")


@router.post("", response_model=EstimateTemplateOut)
async def create_template(body: EstimateTemplateCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("estimate_templates", body.model_dump(exclude_none=True))
    return rows[0]


@router.get("/{template_id}", response_model=EstimateTemplateOut)
async def get_template(template_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("estimate_templates", f"?id=eq.{template_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Template not found")
    return rows[0]


@router.patch("/{template_id}", response_model=EstimateTemplateOut)
async def update_template(template_id: str, body: EstimateTemplateUpdate, _: CurrentUser = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db_patch("estimate_templates", template_id, updates)
    rows = await db_get("estimate_templates", f"?id=eq.{template_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Template not found")
    return rows[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("estimate_templates", template_id)
    return {"ok": True}


@router.post("/{template_id}/duplicate", response_model=EstimateTemplateOut)
async def duplicate_template(template_id: str, _: CurrentUser = Depends(get_current_user)):
    originals = await db_get("estimate_templates", f"?id=eq.{template_id}")
    if not originals:
        raise HTTPException(status_code=404, detail="Template not found")
    original = originals[0]

    new_template = (
        await db_post(
            "estimate_templates",
            {
                "name": f"{original['name']} (copy)",
                "category": original.get("category"),
                "description": original.get("description"),
            },
        )
    )[0]

    items = await db_get("estimate_template_items", f"?template_id=eq.{template_id}&order=sort_order.asc")
    if items:
        await db_post_many(
            "estimate_template_items",
            [_copy_item_fields(item, new_template["id"]) for item in items],
        )
    rows = await db_get("estimate_templates", f"?id=eq.{new_template['id']}")
    return rows[0]


@router.post("/from-estimate/{estimate_id}", response_model=EstimateTemplateOut)
async def create_template_from_estimate(
    estimate_id: str, body: SaveAsTemplateRequest, _: CurrentUser = Depends(get_current_user)
):
    estimates = await db_get("estimates", f"?id=eq.{estimate_id}")
    if not estimates:
        raise HTTPException(status_code=404, detail="Estimate not found")

    new_template = (await db_post("estimate_templates", body.model_dump(exclude_none=True)))[0]

    items = await db_get("estimate_line_items", f"?estimate_id=eq.{estimate_id}&order=sort_order.asc")
    if items:
        await db_post_many(
            "estimate_template_items",
            [_copy_item_fields(item, new_template["id"]) for item in items],
        )
    rows = await db_get("estimate_templates", f"?id=eq.{new_template['id']}")
    return rows[0]


@router.post("/{template_id}/apply", response_model=EstimateOut)
async def apply_template(template_id: str, body: ApplyTemplateRequest, _: CurrentUser = Depends(get_current_user)):
    templates = await db_get("estimate_templates", f"?id=eq.{template_id}")
    if not templates:
        raise HTTPException(status_code=404, detail="Template not found")

    siblings = await db_get(
        "estimates", f"?project_id=eq.{body.project_id}&select=version&order=version.desc&limit=1"
    )
    next_version = (siblings[0]["version"] + 1) if siblings else 1

    new_estimate = (
        await db_post(
            "estimates",
            {
                "project_id": body.project_id,
                "version": next_version,
                "status": "draft",
                "closing_text": DEFAULT_CLOSING_TEXT,
            },
        )
    )[0]

    items = await db_get("estimate_template_items", f"?template_id=eq.{template_id}&order=sort_order.asc")
    if items:
        await db_post_many(
            "estimate_line_items",
            [
                {
                    "estimate_id": new_estimate["id"],
                    "cost_code_id": item.get("cost_code_id"),
                    "group_name": item.get("group_name"),
                    "bucket": item.get("bucket"),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "quantity": item.get("quantity"),
                    "unit": item.get("unit"),
                    "unit_cost": item.get("unit_cost"),
                    "cost_type": item.get("cost_type"),
                    "builder_cost": item.get("builder_cost"),
                    "markup_type": item.get("markup_type"),
                    "markup_value": item.get("markup_value"),
                    "owner_price": item.get("owner_price"),
                    "estimated_days": item.get("estimated_days"),
                    "notes_internal": item.get("notes_internal"),
                    "notes_external": item.get("notes_external"),
                    "sort_order": item.get("sort_order"),
                }
                for item in items
            ],
        )
        await _recalc_estimate_totals(new_estimate["id"])
    full = await db_get("estimates", f"?id=eq.{new_estimate['id']}&select=*,projects(name)")
    return full[0]


def _copy_item_fields(item: dict, new_template_id: str) -> dict:
    return {
        "template_id": new_template_id,
        "cost_code_id": item.get("cost_code_id"),
        "group_name": item.get("group_name"),
        "bucket": item.get("bucket"),
        "title": item.get("title"),
        "description": item.get("description"),
        "quantity": item.get("quantity"),
        "unit": item.get("unit"),
        "unit_cost": item.get("unit_cost"),
        "cost_type": item.get("cost_type"),
        "builder_cost": item.get("builder_cost"),
        "markup_type": item.get("markup_type"),
        "markup_value": item.get("markup_value"),
        "owner_price": item.get("owner_price"),
        "estimated_days": item.get("estimated_days"),
        "notes_internal": item.get("notes_internal"),
        "notes_external": item.get("notes_external"),
        "sort_order": item.get("sort_order"),
    }


@router.get("/{template_id}/items", response_model=list[TemplateLineItemOut])
async def list_template_items(template_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get(
        "estimate_template_items", f"?template_id=eq.{template_id}&order=sort_order.asc&select=*,cost_codes(code,name)"
    )


@router.post("/{template_id}/items", response_model=TemplateLineItemOut)
async def create_template_item(
    template_id: str, body: TemplateLineItemCreate, _: CurrentUser = Depends(get_current_user)
):
    builder_cost, owner_price = _compute_costs(body.quantity, body.unit_cost, body.markup_type, body.markup_value)
    data = {
        **body.model_dump(exclude_none=True),
        "template_id": template_id,
        "builder_cost": builder_cost,
        "owner_price": owner_price,
    }
    rows = await db_post("estimate_template_items", data)
    full = await db_get("estimate_template_items", f"?id=eq.{rows[0]['id']}&select=*,cost_codes(code,name)")
    return full[0]


@router.patch("/{template_id}/items/{item_id}", response_model=TemplateLineItemOut)
async def update_template_item(
    template_id: str, item_id: str, body: TemplateLineItemUpdate, _: CurrentUser = Depends(get_current_user)
):
    existing_rows = await db_get("estimate_template_items", f"?id=eq.{item_id}")
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Line item not found")
    existing = existing_rows[0]
    updates = body.model_dump(exclude_none=True)
    merged = {**existing, **updates}
    builder_cost, owner_price = _compute_costs(
        merged.get("quantity") or 0, merged.get("unit_cost") or 0, merged.get("markup_type") or "percent", merged.get("markup_value") or 0
    )
    updates["builder_cost"] = builder_cost
    updates["owner_price"] = owner_price
    await db_patch("estimate_template_items", item_id, updates)
    full = await db_get("estimate_template_items", f"?id=eq.{item_id}&select=*,cost_codes(code,name)")
    return full[0]


@router.delete("/{template_id}/items/{item_id}")
async def delete_template_item(template_id: str, item_id: str, _: CurrentUser = Depends(get_current_user)):
    await db_delete("estimate_template_items", item_id)
    return {"ok": True}
