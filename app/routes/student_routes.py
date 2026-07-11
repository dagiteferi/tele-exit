from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from app.auth.dependencies import get_current_student_id
from app.core.di import (
    AppContainer,
    get_container,
)
from app.domain.agents.memory_agent import MemoryAgent
from app.domain.models import SessionEvent
from app.schemas import (
    CalendarEventOut,
    OpeningQuestion,
    ProfileResponse,
    SessionEndRequest,
    SessionEndResponse,
    SessionStartResponse,
    SettingsUpdateRequest,
    SettingsUpdateResponse,
    TopicScoreOut,
)

router = APIRouter(prefix="/students/me", tags=["students"])


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    profile = await container.repo.get_profile(student_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )
    scores = {
        topic: TopicScoreOut(
            correct=int(score["correct"]),
            attempted=int(score["attempted"]),
            accuracy=float(score["accuracy"]),
        )
        for topic, score in (profile.get("topic_scores") or {}).items()
    }
    return ProfileResponse(
        student_id=student_id,
        weak_topics=list(profile.get("weak_topics") or []),
        topic_scores=scores,
        sessions_completed=int(profile.get("sessions_completed", 0)),
        last_session_at=profile.get("last_session_at"),
        readiness_percent=int(profile.get("readiness_percent", 0)),
    )


@router.patch("/settings", response_model=SettingsUpdateResponse)
async def update_settings(
    body: SettingsUpdateRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    await container.repo.update_settings(student_id, body.report_frequency)
    return SettingsUpdateResponse(report_frequency=body.report_frequency)


@router.get("/calendar", response_model=list[CalendarEventOut])
async def list_calendar(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    events = await container.repo.list_calendar_events(student_id)
    return [CalendarEventOut(**event) for event in events]


@router.post("/session/start", response_model=SessionStartResponse)
async def session_start(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    room = await container.video_session.create_room(student_id)
    profile = await container.repo.get_profile(student_id)
    weak_topics = list(profile.get("weak_topics") or [])
    topic_hint = weak_topics[0] if weak_topics else "exam preparation"
    matches = await container.vector_store.query(
        topic_hint,
        container.embedding,
        top_k=1,
    )
    if matches:
        match = matches[0]
        opening = OpeningQuestion(
            question_id=str(match.get("id") or "opening"),
            topic=str(match.get("topic") or topic_hint),
            text=str(match.get("question_text") or f"Let's review {topic_hint}."),
        )
    else:
        opening = OpeningQuestion(
            question_id="opening-default",
            topic=topic_hint,
            text=f"Let's practice {topic_hint}. What do you already know?",
        )
    return SessionStartResponse(
        room_name=room["room_name"],
        access_token=room["access_token"],
        opening_question=opening,
    )


@router.post("/session/end", response_model=SessionEndResponse)
async def session_end(
    body: SessionEndRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    memory = MemoryAgent(container.repo)
    events = [
        SessionEvent(
            student_id=student_id,
            question_id=item.question_id,
            topic=item.topic,
            student_answer_transcript=item.student_answer_transcript,
            was_correct=item.was_correct,
            agent_used=item.agent_used,
        )
        for item in body.session_events
    ]
    profile = await memory.record_events(student_id, events)
    return SessionEndResponse(
        events_recorded=len(events),
        updated_weak_topics=list(profile.weak_topics),
    )
