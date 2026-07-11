from __future__ import annotations

from typing import Any


class FakeLLM:
    def __init__(
        self,
        intent: str = "curriculum",
        response: str = "fake answer",
    ) -> None:
        self.intent = intent
        self.response = response
        self.generate_calls: list[tuple[str, str]] = []
        self.classify_calls: list[str] = []

    async def generate(self, prompt: str, system: str = "") -> str:
        self.generate_calls.append((prompt, system))
        return self.response

    async def classify_intent(self, transcript: str) -> str:
        self.classify_calls.append(transcript)
        return self.intent


class FakeEmbedding:
    async def embed(self, text: str) -> list[float]:
        return [float(len(text))]


class FakeVectorStore:
    def __init__(self, matches: list[dict] | None = None) -> None:
        self.matches = matches or []
        self.query_calls: list[tuple[str, int]] = []
        self.stored: list[tuple[Any, list[float]]] = []

    async def store(self, question: Any, embedding: list[float]) -> None:
        self.stored.append((question, embedding))

    async def query(
        self, text: str, embedding_port: Any, top_k: int = 3
    ) -> list[dict]:
        self.query_calls.append((text, top_k))
        return self.matches[:top_k]


class FakeWebSearch:
    def __init__(self, results: list[dict] | None = None) -> None:
        self.results = results if results is not None else []
        self.calls: list[str] = []

    async def search(self, query: str) -> list[dict]:
        self.calls.append(query)
        return self.results


class FakeVideoSearch:
    def __init__(self, video: dict | None = None) -> None:
        self.video = video or {
            "title": "Graphs Explained",
            "url": "https://youtube.com/watch?v=abc",
            "timestamp": "2:15",
            "description": "Intro to graphs",
        }
        self.calls: list[str] = []

    async def find_video(self, topic: str) -> dict:
        self.calls.append(topic)
        return self.video


class FakeCalendar:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def create_study_event(
        self, student_id: str, topic: str, start_iso: str, duration_minutes: int
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

    async def get_user_by_id(self, user_id: str) -> dict | None:
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
