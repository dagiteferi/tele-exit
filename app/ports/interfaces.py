from abc import (
    ABC,
    abstractmethod,
)
from typing import Any


class LLMPort(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system: str = "") -> str: ...

    @abstractmethod
    async def classify_intent(self, transcript: str) -> str: ...


class WebSearchPort(ABC):
    @abstractmethod
    async def search(self, query: str) -> list[dict]: ...


class VideoSearchPort(ABC):
    @abstractmethod
    async def find_video(self, topic: str) -> dict: ...


class EmbeddingPort(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]: ...


class VectorStorePort(ABC):
    @abstractmethod
    async def store(self, question: Any, embedding: list[float]) -> None: ...

    @abstractmethod
    async def query(
        self, text: str, embedding_port: EmbeddingPort, top_k: int = 3
    ) -> list[dict]: ...


class RepositoryPort(ABC):
    @abstractmethod
    async def create_user(
        self,
        email: str,
        password_hash: str,
        name: str,
        field_of_study: str | None,
        exam_date: str | None,
        report_frequency: str,
    ) -> str: ...

    @abstractmethod
    async def get_user_by_email(self, email: str) -> dict | None: ...

    @abstractmethod
    async def get_user_by_id(self, user_id: str) -> dict | None: ...

    @abstractmethod
    async def get_profile(self, student_id: str) -> dict: ...

    @abstractmethod
    async def save_profile(self, profile: Any) -> None: ...

    @abstractmethod
    async def record_session_event(self, event: Any) -> None: ...

    @abstractmethod
    async def update_settings(self, student_id: str, report_frequency: str) -> None: ...

    @abstractmethod
    async def list_calendar_events(self, student_id: str) -> list[dict]: ...

    @abstractmethod
    async def write_outbox_record(self, event_type: str, payload: dict) -> None: ...

    @abstractmethod
    async def get_pending_outbox_records(self) -> list[dict]: ...

    @abstractmethod
    async def mark_outbox_sent(self, record_id: str) -> None: ...

    @abstractmethod
    async def mark_outbox_failed(self, record_id: str) -> None: ...


class CalendarPort(ABC):
    @abstractmethod
    async def create_study_event(
        self, student_id: str, topic: str, start_iso: str, duration_minutes: int
    ) -> str: ...


class EmailPort(ABC):
    @abstractmethod
    async def send(self, to: str, subject: str, body_html: str) -> None: ...


class VideoSessionPort(ABC):
    @abstractmethod
    async def create_room(self, student_id: str) -> dict: ...
