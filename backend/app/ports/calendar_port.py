from abc import (
    ABC,
    abstractmethod,
)


class CalendarPort(ABC):
    @abstractmethod
    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
        attendee_email: str | None = None,
    ) -> str: ...
