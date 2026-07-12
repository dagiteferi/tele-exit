from __future__ import annotations

from dataclasses import (
    dataclass,
    field,
)
from datetime import (
    datetime,
    timezone,
)
from enum import Enum
from typing import Optional


WEAK_ACCURACY_THRESHOLD = 0.6
MIN_ATTEMPTS_FOR_WEAK = 2
MAX_OUTBOX_ATTEMPTS = 5


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


class ReportFrequency(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class UserRole(str, Enum):
    STUDENT = "student"
    ADMIN = "admin"


class AgentKind(str, Enum):
    CURRICULUM = "curriculum"
    SEARCH = "search"
    YOUTUBE = "youtube"
    MEMORY = "memory"
    PLANNER = "planner"
    SUPERVISOR = "supervisor"
    SYNTHESIZER = "synthesizer"


class Intent(str, Enum):
    CURRICULUM = "curriculum"
    SEARCH = "search"
    YOUTUBE = "youtube"


class OutboxStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


@dataclass
class User:
    id: str
    email: str
    password_hash: str
    name: str
    field_of_study: Optional[str] = None
    exam_date: Optional[str] = None
    report_frequency: ReportFrequency = ReportFrequency.WEEKLY
    role: UserRole = UserRole.STUDENT
    created_at: str = field(default_factory=_utc_now_iso)

    def __post_init__(self) -> None:
        if isinstance(self.report_frequency, str):
            self.report_frequency = ReportFrequency(self.report_frequency)
        if isinstance(self.role, str):
            self.role = UserRole(self.role)
        if self.role is UserRole.STUDENT:
            if not self.field_of_study:
                raise ValueError("Students require field_of_study")
            if not self.exam_date:
                raise ValueError("Students require exam_date")

    @property
    def is_admin(self) -> bool:
        return self.role is UserRole.ADMIN

    @property
    def is_student(self) -> bool:
        return self.role is UserRole.STUDENT


@dataclass
class TopicScore:
    topic: str
    correct: int = 0
    attempted: int = 0

    def __post_init__(self) -> None:
        if self.correct < 0 or self.attempted < 0:
            raise ValueError("correct and attempted must be non-negative")
        if self.correct > self.attempted:
            raise ValueError("correct cannot exceed attempted")

    @property
    def accuracy(self) -> float:
        return self.correct / self.attempted if self.attempted else 0.0

    @property
    def is_weak(self) -> bool:
        return (
            self.attempted >= MIN_ATTEMPTS_FOR_WEAK
            and self.accuracy < WEAK_ACCURACY_THRESHOLD
        )

    def record_attempt(self, was_correct: bool) -> None:
        self.attempted += 1
        if was_correct:
            self.correct += 1


@dataclass
class LearnerProfile:
    student_id: str
    weak_topics: list[str] = field(default_factory=list)
    topic_scores: dict[str, TopicScore] = field(default_factory=dict)
    last_session_at: Optional[str] = None
    sessions_completed: int = 0

    def get_or_create_score(self, topic: str) -> TopicScore:
        if topic not in self.topic_scores:
            self.topic_scores[topic] = TopicScore(topic=topic)
        return self.topic_scores[topic]

    def apply_session_event(self, topic: str, was_correct: bool) -> TopicScore:
        score = self.get_or_create_score(topic)
        score.record_attempt(was_correct)
        self.recompute_weak_topics()
        return score

    def recompute_weak_topics(self) -> list[str]:
        self.weak_topics = sorted(
            score.topic for score in self.topic_scores.values() if score.is_weak
        )
        return self.weak_topics

    def mark_session_completed(self, occurred_at: Optional[str] = None) -> None:
        self.sessions_completed += 1
        self.last_session_at = occurred_at or _utc_now_iso()

    def readiness_percent(self) -> int:
        if not self.topic_scores:
            return 0
        accuracies = [score.accuracy for score in self.topic_scores.values()]
        average = sum(accuracies) / len(accuracies)
        weak_penalty = min(len(self.weak_topics) * 5, 30)
        raw = round(average * 100) - weak_penalty
        return max(0, min(100, raw))


@dataclass
class ExamQuestion:
    id: str
    topic: str
    year: int
    question_text: str
    reference_answer: str
    source: str = "user_uploaded"
    exam_id: Optional[str] = None
    field_of_study: Optional[str] = None
    choices: Optional[list[str]] = None
    explanation: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.topic.strip():
            raise ValueError("topic is required")
        if not self.question_text.strip():
            raise ValueError("question_text is required")
        if not self.reference_answer.strip():
            raise ValueError("reference_answer is required")
        if self.year < 1900 or self.year > 2100:
            raise ValueError("year is out of range")
        if self.choices is not None and not isinstance(self.choices, list):
            raise ValueError("choices must be a list of strings")


@dataclass
class SessionEvent:
    student_id: str
    question_id: str
    topic: str
    student_answer_transcript: str
    was_correct: bool
    agent_used: str
    occurred_at: str = field(default_factory=_utc_now_iso)

    def __post_init__(self) -> None:
        if not self.student_id:
            raise ValueError("student_id is required")
        if not self.question_id:
            raise ValueError("question_id is required")
        if not self.topic.strip():
            raise ValueError("topic is required")
        allowed = {
            AgentKind.CURRICULUM.value,
            AgentKind.SEARCH.value,
            AgentKind.YOUTUBE.value,
        }
        if self.agent_used not in allowed:
            raise ValueError(f"agent_used must be one of {sorted(allowed)}")


@dataclass
class OutboxRecord:
    id: str
    event_type: str
    payload: dict
    status: str = OutboxStatus.PENDING.value
    attempts: int = 0
    created_at: str = field(default_factory=_utc_now_iso)

    def __post_init__(self) -> None:
        if not self.event_type:
            raise ValueError("event_type is required")
        if self.payload is None:
            raise ValueError("payload is required")

    @property
    def is_pending(self) -> bool:
        return self.status == OutboxStatus.PENDING.value

    @property
    def can_retry(self) -> bool:
        return self.is_pending and self.attempts < MAX_OUTBOX_ATTEMPTS

    def mark_sent(self) -> None:
        self.status = OutboxStatus.SENT.value

    def mark_failed(self) -> None:
        self.attempts += 1
        if self.attempts >= MAX_OUTBOX_ATTEMPTS:
            self.status = OutboxStatus.FAILED.value
        else:
            self.status = OutboxStatus.PENDING.value
