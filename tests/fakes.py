from __future__ import annotations

from typing import Any

from app.adapters.fakes import (
    FakeEmbedding,
    FakeLLM,
    FakeSearch,
    FakeVectorSearch,
    FakeVideoSearch,
)

FakeWebSearch = FakeSearch
FakeVectorStore = FakeVectorSearch


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
    ) -> str:
        event_id = f"evt-{len(self.events) + 1}"
        self.events.append(
            {
                "id": event_id,
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": duration_minutes,
            }
        )
        return event_id


class FakeRepository:
    def __init__(self, profile: dict | None = None) -> None:
        self.profiles: dict[str, Any] = {}
        self.events: list[Any] = []
        self.outbox: list[dict] = []
        if profile is not None:
            self.profiles[profile["student_id"]] = profile

    async def create_user(self, *args, **kwargs) -> str:
        raise NotImplementedError

    async def get_user_by_email(self, email: str) -> dict | None:
        raise NotImplementedError

    async def get_profile(self, student_id: str) -> dict:
        return self.profiles.get(student_id, {})

    async def save_profile(self, profile: Any) -> None:
        if hasattr(profile, "student_id"):
            self.profiles[profile.student_id] = profile
        else:
            self.profiles[profile["student_id"]] = profile

    async def record_session_event(self, event: Any) -> None:
        self.events.append(event)

    async def update_settings(self, student_id: str, report_frequency: str) -> None:
        raise NotImplementedError

    async def list_calendar_events(self, student_id: str) -> list[dict]:
        return []

    async def write_outbox_record(self, event_type: str, payload: dict) -> None:
        self.outbox.append({"event_type": event_type, "payload": payload})

    async def get_pending_outbox_records(self) -> list[dict]:
        return list(self.outbox)

    async def mark_outbox_sent(self, record_id: str) -> None:
        raise NotImplementedError

    async def mark_outbox_failed(self, record_id: str) -> None:
        raise NotImplementedError
