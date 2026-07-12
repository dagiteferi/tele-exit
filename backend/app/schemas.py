from typing import (
    Literal,
    Optional,
)

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    field_of_study: str
    exam_date: str
    report_frequency: Literal["weekly", "monthly"] = "weekly"


class RegisterResponse(BaseModel):
    student_id: str
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    student_id: str
    name: str
    email: str
    role: Literal["student", "admin"]
    field_of_study: Optional[str] = None
    exam_date: Optional[str] = None


class UploadResponse(BaseModel):
    ingested: int
    skipped: int = 0
    errors: list[str] = Field(default_factory=list)


class TopicScoreOut(BaseModel):
    correct: int
    attempted: int
    accuracy: float


class ProfileResponse(BaseModel):
    student_id: str
    weak_topics: list[str]
    topic_scores: dict[str, TopicScoreOut]
    sessions_completed: int
    last_session_at: Optional[str] = None
    readiness_percent: int = 0


class SettingsUpdateRequest(BaseModel):
    report_frequency: Literal["weekly", "monthly"]


class SettingsUpdateResponse(BaseModel):
    status: str = "ok"
    report_frequency: str


class CalendarEventOut(BaseModel):
    id: str
    topic: str
    start_iso: str
    duration_minutes: int
    external_event_id: Optional[str] = None


class OpeningQuestion(BaseModel):
    question_id: str
    topic: str
    text: str


class SessionStartResponse(BaseModel):
    room_name: str
    access_token: str
    opening_question: OpeningQuestion


class SessionEventIn(BaseModel):
    question_id: str
    topic: str
    student_answer_transcript: str
    was_correct: bool
    agent_used: Literal["curriculum", "search", "youtube"]


class SessionEndRequest(BaseModel):
    session_events: list[SessionEventIn]


class SessionEndResponse(BaseModel):
    status: str = "ok"
    events_recorded: int
    updated_weak_topics: list[str]


class HealthResponse(BaseModel):
    status: str = "ok"


class ReportTriggerResponse(BaseModel):
    status: str = "ok"
    student_id: str
