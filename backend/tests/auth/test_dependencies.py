import pytest
from fastapi import (
    Depends,
    FastAPI,
)
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    get_current_admin,
    get_current_student_id,
)
from app.auth.security import create_access_token


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.get("/student-only")
    async def student_only(student_id: str = Depends(get_current_student_id)):
        return {"student_id": student_id}

    @app.get("/admin-only")
    async def admin_only(admin_id: str = Depends(get_current_admin)):
        return {"admin_id": admin_id}

    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(_build_app())


def test_get_current_student_id_accepts_valid_token(client: TestClient):
    token = create_access_token("s1", role="student")
    response = client.get(
        "/student-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == {"student_id": "s1"}


def test_get_current_student_id_rejects_missing_and_invalid_token(client: TestClient):
    missing = client.get("/student-only")
    assert missing.status_code == 401

    invalid = client.get(
        "/student-only",
        headers={"Authorization": "Bearer bad.token.value"},
    )
    assert invalid.status_code == 401
    assert invalid.json()["detail"] == "Invalid or expired token"


def test_get_current_admin_allows_admin_token(client: TestClient):
    token = create_access_token("admin-1", role="admin")
    response = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == {"admin_id": "admin-1"}


def test_get_current_admin_forbids_student_token(client: TestClient):
    token = create_access_token("s1", role="student")
    response = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin role required"


def test_get_current_admin_rejects_invalid_token(client: TestClient):
    response = client.get(
        "/admin-only",
        headers={"Authorization": "Bearer not-valid"},
    )
    assert response.status_code == 401
