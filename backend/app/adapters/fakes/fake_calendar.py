from app.ports.calendar_port import CalendarPort


class FakeCalendar(CalendarPort):
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
    ) -> str:
        event_id = f"fake-cal-{len(self.events) + 1}"
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
