"""Viewer accounts are read-only on every mutating route. Media cap is 150 MB."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app as production_app
from app.media_links import MAX_MEDIA_BYTES, assert_media_size
from app.schemas.rentals import RentalWorkOrderUploadRequest
from app.security import create_access_token
from app.viewer_guard import ViewerReadOnlyMiddleware, viewer_must_block


def _token(role: str) -> str:
    return create_access_token(
        user_id="user-1",
        email="jessica@example.com",
        name="Jessica",
        role=role,
        is_admin=False,
    )


def _client() -> TestClient:
    mini = FastAPI()
    mini.add_middleware(ViewerReadOnlyMiddleware)

    @mini.get("/api/rentals/rent-roll")
    def rent_roll():
        return {"ok": True}

    @mini.get("/api/rental-files/{file_id}/download")
    def rental_download(file_id: str):
        return {"file_id": file_id}

    @mini.get("/api/rental-work-orders/{work_order_id}/media/{media_id}/download")
    def media_download(work_order_id: str, media_id: str):
        return {"work_order_id": work_order_id, "media_id": media_id}

    @mini.post("/api/rental-work-orders")
    def create_work_order():
        return {"ok": True}

    @mini.patch("/api/projects/{project_id}")
    def patch_project(project_id: str):
        return {"id": project_id}

    @mini.put("/api/estimates/{estimate_id}")
    def put_estimate(estimate_id: str):
        return {"id": estimate_id}

    @mini.delete("/api/tasks/{task_id}")
    def delete_task(task_id: str):
        return {"id": task_id}

    @mini.post("/api/auth/login")
    def login():
        return {"ok": True}

    @mini.post("/api/auth/logout")
    def logout():
        return {"ok": True}

    @mini.post("/api/cron/notifications-tick")
    def cron():
        return {"ok": True}

    return TestClient(mini)


def test_production_app_installs_the_guard():
    names = [getattr(m, "cls", type(m)).__name__ for m in production_app.user_middleware]
    assert "ViewerReadOnlyMiddleware" in names


def test_viewer_mutations_are_403_across_the_api():
    client = _client()
    cookies = {"session": _token("viewer")}
    for method, path in (
        ("post", "/api/rental-work-orders"),
        ("patch", "/api/projects/p1"),
        ("put", "/api/estimates/e1"),
        ("delete", "/api/tasks/t1"),
    ):
        response = getattr(client, method)(path, cookies=cookies)
        assert response.status_code == 403, (method, path, response.text)
        assert response.json()["detail"] == "This account is read-only."


def test_viewer_can_read_and_download():
    client = _client()
    cookies = {"session": _token("viewer")}
    assert client.get("/api/rentals/rent-roll", cookies=cookies).status_code == 200
    assert client.get("/api/rental-files/file-1/download", cookies=cookies).status_code == 200
    assert (
        client.get("/api/rental-work-orders/wo-1/media/med-1/download", cookies=cookies).status_code == 200
    )


def test_viewer_can_log_in_and_out():
    client = _client()
    cookies = {"session": _token("viewer")}
    assert client.post("/api/auth/login", cookies=cookies).status_code == 200
    assert client.post("/api/auth/logout", cookies=cookies).status_code == 200


def test_member_and_anonymous_mutations_are_not_blocked_here():
    client = _client()
    assert client.post("/api/rental-work-orders", cookies={"session": _token("member")}).status_code == 200
    # No session: cron and Twilio keep their own checks. This guard does not 403 them.
    assert client.post("/api/cron/notifications-tick").status_code == 200
    assert client.post("/api/rental-work-orders").status_code == 200


def test_viewer_block_helper_matches_the_route_rules():
    assert viewer_must_block("POST", "/api/rental-leases", "viewer")
    assert not viewer_must_block("GET", "/api/rental-leases", "viewer")
    assert not viewer_must_block("GET", "/api/rental-files/abc/download", "viewer")
    assert not viewer_must_block("GET", "/api/rental-work-orders/wo/media/m/download/", "viewer")
    assert not viewer_must_block("POST", "/api/rental-work-orders", "ops")
    assert not viewer_must_block("POST", "/api/twilio/sms", None)


def test_media_cap_is_150_mb_and_the_upload_body_has_no_file_bytes():
    assert MAX_MEDIA_BYTES == 150 * 1024 * 1024
    assert_media_size(MAX_MEDIA_BYTES, "clip.mp4")
    try:
        assert_media_size(MAX_MEDIA_BYTES + 1, "clip.mp4")
        raise AssertionError("151 MB should be rejected")
    except ValueError as exc:
        assert "150 MB" in str(exc)
    fields = set(RentalWorkOrderUploadRequest.model_fields)
    assert fields == {"file_name", "mime_type", "size_bytes"}
