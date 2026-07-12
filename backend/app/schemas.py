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


class RecentSessionOut(BaseModel):
    id: str
    topic: str
    correct: int
    attempted: int
    date: str


class ProfileResponse(BaseModel):
    student_id: str
    name: str
    email: str
    field_of_study: Optional[str] = None
    exam_date: Optional[str] = None
    report_frequency: Literal["weekly", "monthly"] = "weekly"
    weak_topics: list[str]
    topic_scores: dict[str, TopicScoreOut]
    sessions_completed: int
    last_session_at: Optional[str] = None
    readiness_percent: int = 0
    recent_sessions: list[RecentSessionOut] = Field(default_factory=list)


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


# -- admin --------------------------------------------------------------------


class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Literal["student", "admin"]
    field_of_study: Optional[str] = None
    exam_date: Optional[str] = None
    created_at: Optional[str] = None


class InviteAdminRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=6, max_length=200)


class InviteAdminResponse(BaseModel):
    id: str
    email: str
    name: str
    role: Literal["admin"] = "admin"


class ExamOut(BaseModel):
    id: str
    title: str
    field_of_study: str
    year: Optional[int] = None
    description: Optional[str] = None
    question_count: int = 0
    created_at: Optional[str] = None


class ExamQuestionOut(BaseModel):
    id: str
    topic: str
    year: int
    question_text: str
    choices: Optional[list[str]] = None
    reference_answer: Optional[str] = None
    explanation: Optional[str] = None
    field_of_study: Optional[str] = None


class ExamDetailOut(BaseModel):
    exam: ExamOut
    questions: list[ExamQuestionOut]
    mode: Literal["practice", "exam"]


class ExamUploadResponse(BaseModel):
    exam_id: str
    title: str
    field_of_study: str
    ingested: int
    skipped: int = 0
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    question_count: int = 0


class StartAttemptRequest(BaseModel):
    mode: Literal["practice", "exam"]


class StartAttemptResponse(BaseModel):
    attempt_id: str
    exam_id: str
    mode: Literal["practice", "exam"]
    questions: list[ExamQuestionOut]


class AnswerIn(BaseModel):
    question_id: str
    answer: str


class SubmitAttemptRequest(BaseModel):
    answers: list[AnswerIn]


class SubmitAttemptResponse(BaseModel):
    attempt_id: str
    mode: Literal["practice", "exam"]
    score_correct: int
    score_total: int
    percent: float
    results: list[dict]


class PracticeChatRequest(BaseModel):
    question_id: str
    message: str = Field(min_length=1, max_length=2000)


class PracticeChatResponse(BaseModel):
    reply: str


class StudyCallResponse(BaseModel):
    room_name: str
    access_token: str
    url: Optional[str] = None
    question: ExamQuestionOut
