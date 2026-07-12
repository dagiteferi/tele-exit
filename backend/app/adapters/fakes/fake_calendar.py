from typing import Any

from app.ports.calendar_port import CalendarPort


class FakeCalendar(CalendarPort):
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.last_delivery: dict[str, Any] = {
            "mode": "stub",
            "detail": "Fake calendar (USE_FAKES=true) — not Google Calendar.",
        }

    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
        attendee_email: str | None = None,
    ) -> str:
        event_id = f"fake-cal-{len(self.events) + 1}"
        self.events.append(
            {
                "id": event_id,
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": duration_minutes,
                "attendee_email": attendee_email,
            }
        )
        self.last_delivery = {
            "mode": "stub",
            "detail": "Fake calendar (USE_FAKES=true) — not Google Calendar.",
        }
        return event_id
