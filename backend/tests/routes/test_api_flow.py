import pytest
from fastapi.testclient import TestClient

from app.config import clear_settings_cache
from app.core.di import reset_container
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    clear_settings_cache()
    reset_container()
    monkeypatch.setenv("DB_PATH", str(tmp_path / "api.db"))
    monkeypatch.setenv("USE_FAKES", "true")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@tele.exit")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "admin-pass")
    clear_settings_cache()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    reset_container()
    clear_settings_cache()


def test_register_login_me_flow(client: TestClient):
    register = client.post(
        "/auth/register",
        json={
            "email": "sam@tele.exit",
            "password": "secret12",
            "name": "Sam",
            "field_of_study": "CS",
            "exam_date": "2026-12-01",
        },
    )
    assert register.status_code == 200
    token = register.json()["access_token"]
    student_id = register.json()["student_id"]

    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["student_id"] == student_id
    assert me.json()["role"] == "student"

    login = client.post(
        "/auth/login",
        json={"email": "sam@tele.exit", "password": "secret12"},
    )
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_student_profile_settings_and_session(client: TestClient):
    token = client.post(
        "/auth/register",
        json={
            "email": "learner@tele.exit",
            "password": "secret12",
            "name": "Learner",
            "field_of_study": "CS",
            "exam_date": "2026-12-01",
        },
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    profile = client.get("/students/me/profile", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["sessions_completed"] == 0

    settings = client.patch(
        "/students/me/settings",
        headers=headers,
        json={"report_frequency": "monthly"},
    )
    assert settings.status_code == 200
    assert settings.json()["report_frequency"] == "monthly"

    start = client.post("/students/me/session/start", headers=headers)
    assert start.status_code == 200
    assert "room_name" in start.json()
    assert "opening_question" in start.json()

    end = client.post(
        "/students/me/session/end",
        headers=headers,
        json={
            "session_events": [
                {
                    "question_id": "q1",
                    "topic": "Graphs",
                    "student_answer_transcript": "wrong",
                    "was_correct": False,
                    "agent_used": "curriculum",
                },
                {
                    "question_id": "q2",
                    "topic": "Graphs",
                    "student_answer_transcript": "still wrong",
                    "was_correct": False,
                    "agent_used": "search",
                },
            ]
        },
    )
    assert end.status_code == 200
    assert end.json()["events_recorded"] == 2
    assert "Graphs" in end.json()["updated_weak_topics"]


def test_admin_upload_and_report(client: TestClient):
    admin_login = client.post(
        "/auth/login",
        json={"email": "admin@tele.exit", "password": "admin-pass"},
    )
    assert admin_login.status_code == 200
    admin_headers = {
        "Authorization": f"Bearer {admin_login.json()['access_token']}"
    }

    upload = client.post(
        "/questions/upload",
        headers=admin_headers,
        files={
            "file": (
                "q.json",
                b'[{"topic":"Graphs","year":2023,"question_text":"What is BFS?","reference_answer":"Level order"}]',
                "application/json",
            )
        },
    )
    assert upload.status_code == 200
    assert upload.json()["ingested"] == 1

    student_token = client.post(
        "/auth/register",
        json={
            "email": "report@tele.exit",
            "password": "secret12",
            "name": "Report",
            "field_of_study": "CS",
            "exam_date": "2026-12-01",
        },
    ).json()["access_token"]
    report = client.post(
        "/students/me/report",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert report.status_code == 200
    assert report.json()["status"] == "ok"
