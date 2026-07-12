import pytest

from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.domain.models import (
    MAX_OUTBOX_ATTEMPTS,
    SessionEvent,
)
from app.ports.repository_port import RepositoryPort


@pytest.fixture
def repo(tmp_path) -> SQLiteRepositoryAdapter:
    return SQLiteRepositoryAdapter(db_path=str(tmp_path / "test.db"))


def test_adapter_implements_repository_port(repo: SQLiteRepositoryAdapter):
    assert isinstance(repo, RepositoryPort)


@pytest.mark.asyncio
async def test_create_and_get_user(repo: SQLiteRepositoryAdapter):
    user_id = await repo.create_user(
        email="sam@tele.exit",
        password_hash="hashed",
        name="Sam",
        field_of_study="CS",
        exam_date="2026-12-01",
        report_frequency="weekly",
    )
    by_email = await repo.get_user_by_email("sam@tele.exit")
    by_id = await repo.get_user_by_id(user_id)
    assert by_email is not None
    assert by_email["id"] == user_id
    assert by_email["role"] == "student"
    assert by_id["email"] == "sam@tele.exit"
    assert await repo.get_user_by_email("missing@tele.exit") is None


@pytest.mark.asyncio
async def test_create_admin_user(repo: SQLiteRepositoryAdapter):
    admin_id = await repo.create_user(
        email="admin@tele.exit",
        password_hash="hashed",
        name="Admin",
        field_of_study=None,
        exam_date=None,
        report_frequency="weekly",
        role="admin",
    )
    admin = await repo.get_user_by_id(admin_id)
    assert admin["role"] == "admin"
    assert admin["field_of_study"] is None


@pytest.mark.asyncio
async def test_get_profile_auto_creates_and_updates_from_events(
    repo: SQLiteRepositoryAdapter,
):
    user_id = await repo.create_user(
        email="learner@tele.exit",
        password_hash="hashed",
        name="Learner",
        field_of_study="CS",
        exam_date="2026-12-01",
        report_frequency="weekly",
    )
    profile = await repo.get_profile(user_id)
    assert profile["student_id"] == user_id
    assert profile["sessions_completed"] == 0
    assert profile["topic_scores"] == {}

    await repo.record_session_event(
        SessionEvent(
            student_id=user_id,
            question_id="q1",
            topic="Graphs",
            student_answer_transcript="wrong",
            was_correct=False,
            agent_used="curriculum",
        )
    )
    await repo.record_session_event(
        SessionEvent(
            student_id=user_id,
            question_id="q2",
            topic="Graphs",
            student_answer_transcript="still wrong",
            was_correct=False,
            agent_used="search",
        )
    )
    updated = await repo.get_profile(user_id)
    assert updated["topic_scores"]["Graphs"]["attempted"] == 2
    assert "Graphs" in updated["weak_topics"]


@pytest.mark.asyncio
async def test_update_settings_and_outbox_lifecycle(repo: SQLiteRepositoryAdapter):
    user_id = await repo.create_user(
        email="outbox@tele.exit",
        password_hash="hashed",
        name="Outbox",
        field_of_study="CS",
        exam_date="2026-12-01",
        report_frequency="weekly",
    )
    await repo.update_settings(user_id, "monthly")
    user = await repo.get_user_by_id(user_id)
    assert user["report_frequency"] == "monthly"

    await repo.write_outbox_record(
        "create_calendar_event",
        {
            "student_id": user_id,
            "topic": "Trees",
            "start_iso": "2026-07-12T09:00:00",
            "duration_minutes": 30,
            "external_event_id": "evt-1",
        },
    )
    events = await repo.list_calendar_events(user_id)
    assert len(events) == 1
    assert events[0]["topic"] == "Trees"

    pending = await repo.get_pending_outbox_records()
    assert len(pending) == 1
    record_id = pending[0]["id"]
    await repo.mark_outbox_sent(record_id)
    assert await repo.get_pending_outbox_records() == []


@pytest.mark.asyncio
async def test_mark_outbox_failed_until_max_attempts(repo: SQLiteRepositoryAdapter):
    await repo.write_outbox_record("send_report_email", {"to": "a@b.com"})
    pending = await repo.get_pending_outbox_records()
    record_id = pending[0]["id"]

    for _ in range(MAX_OUTBOX_ATTEMPTS - 1):
        await repo.mark_outbox_failed(record_id)
        still_pending = await repo.get_pending_outbox_records()
        assert any(item["id"] == record_id for item in still_pending)

    await repo.mark_outbox_failed(record_id)
    assert all(item["id"] != record_id for item in await repo.get_pending_outbox_records())
