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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = (
        "If that email is registered, we sent a password reset link. Check your inbox."
    )


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=500)
    new_password: str = Field(min_length=6, max_length=200)


class ResetPasswordResponse(BaseModel):
    message: str = "Password updated. You can log in with your new password."


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


class PracticeProgressOut(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    progress_index: int = 0
    question_number: int = 1
    questions_visited: int = 1
    question_total: int = 0
    started_at: str = ""


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
    practice_progress: list[PracticeProgressOut] = Field(default_factory=list)
    session_summaries: list["SessionSummaryOut"] = Field(default_factory=list)


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
    status: str = "suggested"


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
    email_to: Optional[str] = None
    report_preview: str = ""
    calendar_suggestions: int = 0
    delivery_mode: Literal["live", "stub"] = "stub"
    delivery_detail: str = ""
    email_sent: bool = False


class SessionWrapUpEventIn(BaseModel):
    question_id: str
    topic: str = ""
    student_answer_transcript: str = ""
    was_correct: bool = False
    agent_used: Literal["curriculum", "search", "youtube"] = "curriculum"


class SessionWrapUpRequest(BaseModel):
    attempt_id: Optional[str] = None
    exam_id: Optional[str] = None
    exam_title: str = ""
    question_ids: list[str] = Field(default_factory=list)
    events: list[SessionWrapUpEventIn] = Field(default_factory=list)
    questions_visited: Optional[int] = None
    persist_events: bool = True


class SessionSummaryOut(BaseModel):
    id: str
    attempt_id: Optional[str] = None
    exam_id: Optional[str] = None
    exam_title: str = ""
    questions_visited: int = 0
    questions_attempted: int = 0
    questions_correct: int = 0
    topics: list[str] = Field(default_factory=list)
    summary_text: str = ""
    created_at: str = ""


class CalendarRecommendationOut(BaseModel):
    id: str
    topic: str
    start_iso: str
    duration_minutes: int = 30
    status: str = "suggested"
    external_event_id: Optional[str] = None


class SessionWrapUpResponse(BaseModel):
    summary: SessionSummaryOut
    recommendations: list[CalendarRecommendationOut] = Field(default_factory=list)
    weak_topics: list[str] = Field(default_factory=list)
    readiness_percent: int = 0
    sessions_completed: int = 0


class AcceptCalendarResponse(BaseModel):
    status: str = "ok"
    event: CalendarRecommendationOut
    delivery_mode: Literal["live", "stub"] = "stub"
    delivery_detail: str = ""
    html_link: Optional[str] = None


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
    mode: str | None = Field(default=None, description="practice | voice")


class AttemptProgressRequest(BaseModel):
    question_index: int = Field(ge=0, description="0-based question index")
    question_id: str | None = None


class AttemptProgressResponse(BaseModel):
    attempt_id: str
    progress_index: int
    question_number: int
    questions_visited: int
    question_total: int = 0

class PracticeChatVideo(BaseModel):
    title: str = ""
    url: str = ""
    timestamp: str = "0:00"
    description: str = ""


class PracticeChatSession(BaseModel):
    topic: str = ""
    start_iso: str = ""
    duration_minutes: int = 30


class PracticeChatResponse(BaseModel):
    reply: str
    agent_used: str | None = None
    action: str | None = None
    video: PracticeChatVideo | None = None
    scheduled: list[PracticeChatSession] = Field(default_factory=list)


class StudyCallResponse(BaseModel):
    room_name: str
    access_token: str
    url: Optional[str] = None
    question: ExamQuestionOut


class SupportChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    use_web: bool | None = Field(
        default=None,
        description="Force web search supplement; omit to auto-detect",
    )


class SupportChatSource(BaseModel):
    title: str = ""
    source: str = ""


class SupportChatResponse(BaseModel):
    reply: str
    agent_used: str | None = None
    sources: list[SupportChatSource] = Field(default_factory=list)
