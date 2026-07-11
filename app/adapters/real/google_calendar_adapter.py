from __future__ import annotations

import uuid

from app.ports.calendar_port import CalendarPort


class GoogleCalendarAdapter(CalendarPort):
    """Local-first calendar adapter. Writes an external-style event id.

    Full Google Calendar API sync can replace the body of create_study_event
    when GOOGLE_CREDENTIALS_PATH is configured in production.
    """

    def __init__(self, credentials_path: str = "") -> None:
        self.credentials_path = credentials_path
        self.events: list[dict] = []

    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
    ) -> str:
        event_id = f"gcal-{uuid.uuid4()}"
        self.events.append(
            {
                "id": event_id,
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": duration_minutes,
                "credentials_path": self.credentials_path,
            }
        )
        return event_id
