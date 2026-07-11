from datetime import (
    datetime,
    timedelta,
    timezone,
)

from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.prompts import (
    NO_WEAK_TOPICS_TO_SCHEDULE,
    planner_scheduled_message,
)
from app.ports.interfaces import (
    CalendarPort,
    RepositoryPort,
)


DEFAULT_STUDY_MINUTES = 30
MAX_TOPICS_TO_SCHEDULE = 3


class PlannerAgent:
    def __init__(
        self,
        repository: RepositoryPort,
        calendar: CalendarPort,
        study_minutes: int = DEFAULT_STUDY_MINUTES,
    ) -> None:
        self._repository = repository
        self._calendar = calendar
        self._study_minutes = study_minutes

    async def schedule_weak_topics(
        self,
        student_id: str,
        weak_topics: list[str],
        start_from: datetime | None = None,
    ) -> list[dict]:
        if not student_id:
            raise ValueError("student_id is required")

        topics = weak_topics[:MAX_TOPICS_TO_SCHEDULE]
        if not topics:
            return []

        base = start_from or datetime.now(timezone.utc).replace(tzinfo=None)
        created: list[dict] = []
        for index, topic in enumerate(topics):
            start = base + timedelta(days=index + 1)
            start_iso = start.replace(hour=9, minute=0, second=0, microsecond=0).isoformat()
            event_id = await self._calendar.create_study_event(
                student_id=student_id,
                topic=topic,
                start_iso=start_iso,
                duration_minutes=self._study_minutes,
            )
            payload = {
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": self._study_minutes,
                "external_event_id": event_id,
            }
            await self._repository.write_outbox_record("create_calendar_event", payload)
            created.append(payload)
        return created

    async def handle(self, state: AgentState) -> AgentResult:
        if not state.student_id:
            raise ValueError("student_id is required")

        profile = state.profile
        if profile is None:
            profile = await self._repository.get_profile(state.student_id)

        weak_topics = list(profile.get("weak_topics") or []) if profile else []
        scheduled = await self.schedule_weak_topics(state.student_id, weak_topics)

        if not scheduled:
            text = NO_WEAK_TOPICS_TO_SCHEDULE
        else:
            text = planner_scheduled_message(
                [item["topic"] for item in scheduled]
            )

        return AgentResult(
            text=text,
            agent_used="planner",
            metadata={"scheduled": scheduled},
        )
