from datetime import (
    datetime,
    timedelta,
    timezone,
)
import re

from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.prompts import (
    NO_WEAK_TOPICS_TO_SCHEDULE,
    planner_scheduled_message,
)
from app.ports.calendar_port import CalendarPort
from app.ports.repository_port import RepositoryPort


DEFAULT_STUDY_MINUTES = 30
MAX_TOPICS_TO_SCHEDULE = 3

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def parse_schedule_start(
    transcript: str,
    *,
    now: datetime | None = None,
) -> tuple[datetime, str]:
    """Infer when to start scheduling from spoken phrases."""
    base = now or datetime.now(timezone.utc).replace(tzinfo=None)
    text = (transcript or "").lower()

    if re.search(r"\btoday\b", text):
        return base.replace(hour=9, minute=0, second=0, microsecond=0), "today"
    if re.search(r"\btomorrow\b", text):
        day = (base + timedelta(days=1)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        return day, "tomorrow"
    if re.search(r"\bnext week\b", text):
        day = (base + timedelta(days=7)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        return day, "next week"

    for name, weekday in _WEEKDAYS.items():
        if re.search(rf"\b{name}\b", text):
            days_ahead = (weekday - base.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            day = (base + timedelta(days=days_ahead)).replace(
                hour=9, minute=0, second=0, microsecond=0
            )
            return day, name.capitalize()

    # Default: first session tomorrow morning (matches previous planner behavior).
    day = (base + timedelta(days=1)).replace(
        hour=9, minute=0, second=0, microsecond=0
    )
    return day, "tomorrow"


def _weak_topics_from_profile(profile: object | None) -> list[str]:
    if profile is None:
        return []
    if isinstance(profile, dict):
        return list(profile.get("weak_topics") or [])
    weak = getattr(profile, "weak_topics", None)
    return list(weak or [])


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

        topics = [t.strip() for t in weak_topics if str(t).strip()][:MAX_TOPICS_TO_SCHEDULE]
        if not topics:
            return []

        base = start_from or datetime.now(timezone.utc).replace(tzinfo=None)
        created: list[dict] = []
        for index, topic in enumerate(topics):
            start = base if index == 0 else base + timedelta(days=index)
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

        topics = _weak_topics_from_profile(profile)
        if not topics:
            fallback = state.context.get("topic") or state.context.get("fallback_topic")
            if isinstance(fallback, str) and fallback.strip():
                # Use the live question topic so "schedule me" still works mid-call.
                topics = [fallback.strip()[:120]]

        start_from, start_hint = parse_schedule_start(state.transcript)
        scheduled = await self.schedule_weak_topics(
            state.student_id,
            topics,
            start_from=start_from,
        )

        if not scheduled:
            text = NO_WEAK_TOPICS_TO_SCHEDULE
        else:
            text = planner_scheduled_message(
                [item["topic"] for item in scheduled],
                start_hint=start_hint,
            )

        return AgentResult(
            text=text,
            agent_used="planner",
            action="scheduling",
            metadata={"scheduled": scheduled, "start_hint": start_hint},
        )
