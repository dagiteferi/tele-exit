from datetime import (
    datetime,
    timezone,
)

from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.models import (
    LearnerProfile,
    SessionEvent,
    TopicScore,
)
from app.domain.prompts import memory_status_message
from app.ports.repository_port import RepositoryPort


def _profile_from_dict(data: dict) -> LearnerProfile:
    scores_raw = data.get("topic_scores") or {}
    topic_scores: dict[str, TopicScore] = {}
    for topic, score in scores_raw.items():
        if isinstance(score, TopicScore):
            topic_scores[topic] = score
        elif isinstance(score, dict):
            topic_scores[topic] = TopicScore(
                topic=score.get("topic", topic),
                correct=int(score.get("correct", 0)),
                attempted=int(score.get("attempted", 0)),
            )
        else:
            raise TypeError(f"Unsupported topic score type for {topic}")

    return LearnerProfile(
        student_id=data["student_id"],
        weak_topics=list(data.get("weak_topics") or []),
        topic_scores=topic_scores,
        last_session_at=data.get("last_session_at"),
        sessions_completed=int(data.get("sessions_completed", 0)),
    )


def _profile_to_dict(profile: LearnerProfile) -> dict:
    return {
        "student_id": profile.student_id,
        "weak_topics": list(profile.weak_topics),
        "topic_scores": {
            topic: {
                "topic": score.topic,
                "correct": score.correct,
                "attempted": score.attempted,
                "accuracy": score.accuracy,
            }
            for topic, score in profile.topic_scores.items()
        },
        "last_session_at": profile.last_session_at,
        "sessions_completed": profile.sessions_completed,
        "readiness_percent": profile.readiness_percent(),
    }


class MemoryAgent:
    def __init__(self, repository: RepositoryPort) -> None:
        self._repository = repository

    async def load_profile(self, student_id: str) -> LearnerProfile:
        if not student_id:
            raise ValueError("student_id is required")
        data = await self._repository.get_profile(student_id)
        if not data:
            profile = LearnerProfile(student_id=student_id)
            await self._repository.save_profile(profile)
            return profile
        if isinstance(data, LearnerProfile):
            return data
        return _profile_from_dict(data)

    async def record_events(
        self, student_id: str, events: list[SessionEvent]
    ) -> LearnerProfile:
        if not student_id:
            raise ValueError("student_id is required")
        profile = await self.load_profile(student_id)
        for event in events:
            if event.student_id != student_id:
                raise ValueError("session event student_id does not match caller")
            await self._repository.record_session_event(event)
            profile.apply_session_event(event.topic, event.was_correct)

        profile.mark_session_completed(
            occurred_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        )
        await self._repository.save_profile(profile)
        return profile

    async def handle(self, state: AgentState) -> AgentResult:
        profile = await self.load_profile(state.student_id)
        as_dict = _profile_to_dict(profile)
        state.profile = as_dict
        return AgentResult(
            text=memory_status_message(
                sessions_completed=profile.sessions_completed,
                weak_topics=profile.weak_topics,
                readiness_percent=profile.readiness_percent(),
            ),
            agent_used="memory",
            action="checking_progress",
            metadata={"profile": as_dict},
        )
