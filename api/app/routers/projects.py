from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, get_current_user
from ..mentions import create_mention_notifications
from ..schemas.projects import ProjectCreate, ProjectNoteCreate, ProjectNoteOut, ProjectOut, ProjectUpdate
from ..supabase_client import db_get, db_patch, db_post

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    include_archived: bool = False, _: CurrentUser = Depends(get_current_user)
):
    query = "?order=created_at.desc&select=*,clients(id,first_name,last_name)"
    if not include_archived:
        query += "&is_archived=eq.false"
    return await db_get("projects", query)


@router.post("", response_model=ProjectOut)
async def create_project(body: ProjectCreate, _: CurrentUser = Depends(get_current_user)):
    rows = await db_post("projects", body.model_dump(exclude_none=True))
    full = await db_get("projects", f"?id=eq.{rows[0]['id']}&select=*,clients(id,first_name,last_name)")
    return full[0]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, _: CurrentUser = Depends(get_current_user)):
    rows = await db_get("projects", f"?id=eq.{project_id}&select=*,clients(id,first_name,last_name)")
    if not rows:
        raise HTTPException(status_code=404, detail="Project not found")
    return rows[0]


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, body: ProjectUpdate, _: CurrentUser = Depends(get_current_user)):
    await db_patch("projects", project_id, body.model_dump(exclude_none=True))
    full = await db_get("projects", f"?id=eq.{project_id}&select=*,clients(id,first_name,last_name)")
    return full[0]


@router.get("/{project_id}/notes", response_model=list[ProjectNoteOut])
async def list_project_notes(project_id: str, _: CurrentUser = Depends(get_current_user)):
    return await db_get("project_notes", f"?project_id=eq.{project_id}&order=created_at.desc")


@router.post("/{project_id}/notes", response_model=ProjectNoteOut)
async def create_project_note(
    project_id: str, body: ProjectNoteCreate, current_user: CurrentUser = Depends(get_current_user)
):
    rows = await db_post("project_notes", {"project_id": project_id, **body.model_dump()})
    note = rows[0]
    proj = await db_get("projects", f"?id=eq.{project_id}&select=name")
    project_name = proj[0]["name"].split("|")[0].strip() if proj else "a project"
    await create_mention_notifications(
        content=body.content,
        project_id=project_id,
        source_type="project_note",
        source_id=note["id"],
        message=f"{current_user.name or current_user.email} mentioned you in a note on {project_name}",
        exclude_user_id=current_user.id,
    )
    return note
