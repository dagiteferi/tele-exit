from abc import (
    ABC,
    abstractmethod,
)


class RepositoryPort(ABC):
    """Owns all persistence: users, profiles, sessions, outbox, calendar cache."""

    @abstractmethod
    async def create_user(
        self,
        email,
        password_hash,
        name,
        field_of_study,
        exam_date,
        report_frequency,
    ) -> str: ...

    @abstractmethod
    async def get_user_by_email(self, email: str) -> dict | None: ...

    @abstractmethod
    async def get_profile(self, student_id: str) -> dict: ...

    @abstractmethod
    async def record_session_event(self, event) -> None: ...

    @abstractmethod
    async def update_settings(
        self,
        student_id: str,
        report_frequency: str,
    ) -> None: ...

    @abstractmethod
    async def list_calendar_events(self, student_id: str) -> list[dict]: ...

    @abstractmethod
    async def write_outbox_record(
        self,
        event_type: str,
        payload: dict,
    ) -> None: ...

    @abstractmethod
    async def get_pending_outbox_records(self) -> list[dict]: ...

    @abstractmethod
    async def mark_outbox_sent(self, record_id: str) -> None: ...

    @abstractmethod
    async def mark_outbox_failed(self, record_id: str) -> None: ...
