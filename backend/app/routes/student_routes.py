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
from app.domain.session_wrapup import wrap_up_session
from app.schemas import (
    AcceptCalendarResponse,
    CalendarEventOut,
    CalendarRecommendationOut,
    OpeningQuestion,
    PracticeProgressOut,
    ProfileResponse,
    RecentSessionOut,
    SessionEndRequest,
    SessionEndResponse,
    SessionStartResponse,
    SessionSummaryOut,
    SessionWrapUpRequest,
    SessionWrapUpResponse,
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
    recent_rows = await container.repo.list_recent_sessions(student_id)
    recent = [
        RecentSessionOut(
            id=str(row["id"]),
            topic=str(row["topic"]),
            correct=int(row["correct"]),
            attempted=int(row["attempted"]),
            date=str(row["date"]),
        )
        for row in recent_rows
    ]
    practice_rows = await container.repo.list_practice_progress(student_id)
    practice_progress = [
        PracticeProgressOut(
            attempt_id=str(row["attempt_id"]),
            exam_id=str(row["exam_id"]),
            exam_title=str(row["exam_title"]),
            progress_index=int(row["progress_index"]),
            question_number=int(row["question_number"]),
            questions_visited=int(row["questions_visited"]),
            question_total=int(row["question_total"]),
            started_at=str(row.get("started_at") or ""),
        )
        for row in practice_rows
    ]
    summary_rows = await container.repo.list_session_summaries(student_id)
    session_summaries = [
        SessionSummaryOut(
            id=str(row["id"]),
            attempt_id=row.get("attempt_id"),
            exam_id=row.get("exam_id"),
            exam_title=str(row.get("exam_title") or ""),
            questions_visited=int(row.get("questions_visited") or 0),
            questions_attempted=int(row.get("questions_attempted") or 0),
            questions_correct=int(row.get("questions_correct") or 0),
            topics=list(row.get("topics") or []),
            summary_text=str(row.get("summary_text") or ""),
            created_at=str(row.get("created_at") or ""),
        )
        for row in summary_rows
    ]
    freq = profile.get("report_frequency") or "weekly"
    if freq not in ("weekly", "monthly"):
        freq = "weekly"
    return ProfileResponse(
        student_id=student_id,
        name=str(profile.get("name") or "Student"),
        email=str(profile.get("email") or ""),
        field_of_study=profile.get("field_of_study"),
        exam_date=profile.get("exam_date"),
        report_frequency=freq,  # type: ignore[arg-type]
        weak_topics=list(profile.get("weak_topics") or []),
        topic_scores=scores,
        sessions_completed=int(profile.get("sessions_completed", 0)),
        last_session_at=profile.get("last_session_at"),
        readiness_percent=int(profile.get("readiness_percent", 0)),
        recent_sessions=recent,
        practice_progress=practice_progress,
        session_summaries=session_summaries,
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
    return [
        CalendarEventOut(
            id=str(event["id"]),
            topic=str(event["topic"]),
            start_iso=str(event["start_iso"]),
            duration_minutes=int(event["duration_minutes"]),
            external_event_id=event.get("external_event_id"),
            status=str(event.get("status") or "suggested"),
        )
        for event in events
    ]


@router.post(
    "/calendar/events/{event_id}/accept",
    response_model=AcceptCalendarResponse,
)
async def accept_calendar_event(
    event_id: str,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    events = await container.repo.list_calendar_events(student_id)
    match = next((e for e in events if e["id"] == event_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Calendar suggestion not found")

    profile = await container.repo.get_profile(student_id)
    attendee = str((profile or {}).get("email") or "") or None

    external_id = await container.calendar.create_study_event(
        student_id=student_id,
        topic=str(match["topic"]),
        start_iso=str(match["start_iso"]),
        duration_minutes=int(match["duration_minutes"]),
        attendee_email=attendee,
    )
    updated = await container.repo.accept_calendar_event(
        student_id,
        event_id,
        external_event_id=external_id,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Calendar suggestion not found")

    cal_delivery = getattr(container.calendar, "last_delivery", None) or {}
    cal_mode = str(cal_delivery.get("mode") or "stub")
    details: list[str] = []
    if cal_delivery.get("detail"):
        details.append(str(cal_delivery["detail"]))
    html_link = cal_delivery.get("html_link")

    # Demo path: email a real .ics invite so it appears in Google Calendar
    # even when the Calendar API is not enabled yet.
    email_mode = "stub"
    if attendee and "@" in attendee:
        from app.domain.ics_invite import build_study_ics

        organizer = (
            container.settings.smtp_from
            or container.settings.smtp_user
            or container.settings.google_delegated_user
            or "noreply@tele-exit.local"
        )
        ics = build_study_ics(
            topic=str(match["topic"]),
            start_iso=str(match["start_iso"]),
            duration_minutes=int(match["duration_minutes"]),
            attendee_email=attendee,
            organizer_email=organizer,
        )
        when = str(match["start_iso"])
        body = (
            f"<p>Hi,</p>"
            f"<p>Your Tele-Exit practice session was accepted:</p>"
            f"<p><strong>{match['topic']}</strong><br>"
            f"{when} · {match['duration_minutes']} minutes</p>"
            f"<p>Open the attached <code>.ics</code> file (or tap Add to Calendar in Gmail) "
            f"to put this on your Google Calendar.</p>"
            f"<p>— Tele-Exit</p>"
        )
        try:
            await container.email.send(
                attendee,
                f"Tele-Exit practice invite: {match['topic']}",
                body,
                ics_content=ics,
            )
            email_delivery = getattr(container.email, "last_delivery", None) or {}
            email_mode = str(email_delivery.get("mode") or "stub")
            if email_delivery.get("detail"):
                details.append(str(email_delivery["detail"]))
        except Exception as exc:  # noqa: BLE001
            details.append(f"Invite email failed ({exc}).")

    live = cal_mode == "live" or email_mode == "live"
    if live and email_mode == "live" and cal_mode != "live":
        summary = (
            f"Calendar invite emailed to {attendee}. "
            "Open it in Gmail and choose Add to Calendar."
        )
    elif live and cal_mode == "live":
        summary = "Added to Google Calendar."
        if email_mode == "live":
            summary += f" Invite also emailed to {attendee}."
    else:
        summary = " ".join(details) or (
            "Accepted in Tele-Exit only. Configure SMTP_USER/SMTP_PASSWORD for real invite email."
        )

    return AcceptCalendarResponse(
        event=CalendarRecommendationOut(
            id=str(updated["id"]),
            topic=str(updated["topic"]),
            start_iso=str(updated["start_iso"]),
            duration_minutes=int(updated["duration_minutes"]),
            status=str(updated.get("status") or "accepted"),
            external_event_id=updated.get("external_event_id"),
        ),
        delivery_mode="live" if live else "stub",
        delivery_detail=summary,
        html_link=str(html_link) if html_link else None,
    )


@router.post("/session/wrap-up", response_model=SessionWrapUpResponse)
async def session_wrap_up(
    body: SessionWrapUpRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    try:
        result = await wrap_up_session(
            student_id=student_id,
            repo=container.repo,
            llm=container.llm,
            attempt_id=body.attempt_id,
            exam_id=body.exam_id,
            exam_title=body.exam_title,
            question_ids=body.question_ids,
            events=[e.model_dump() for e in body.events],
            questions_visited=body.questions_visited,
            persist_events=body.persist_events,
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err

    summary = result["summary"]
    return SessionWrapUpResponse(
        summary=SessionSummaryOut(
            id=str(summary["id"]),
            attempt_id=summary.get("attempt_id"),
            exam_id=summary.get("exam_id"),
            exam_title=str(summary.get("exam_title") or ""),
            questions_visited=int(summary.get("questions_visited") or 0),
            questions_attempted=int(summary.get("questions_attempted") or 0),
            questions_correct=int(summary.get("questions_correct") or 0),
            topics=list(summary.get("topics") or []),
            summary_text=str(summary.get("summary_text") or ""),
            created_at=str(summary.get("created_at") or ""),
        ),
        recommendations=[
            CalendarRecommendationOut(
                id=str(item["id"]),
                topic=str(item["topic"]),
                start_iso=str(item["start_iso"]),
                duration_minutes=int(item["duration_minutes"]),
                status=str(item.get("status") or "suggested"),
                external_event_id=item.get("external_event_id"),
            )
            for item in result.get("recommendations") or []
        ],
        weak_topics=list(result.get("weak_topics") or []),
        readiness_percent=int(result.get("readiness_percent") or 0),
        sessions_completed=int(result.get("sessions_completed") or 0),
    )


@router.post("/session/start", response_model=SessionStartResponse)
async def session_start(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    room = await container.video_session.create_room(student_id)
    profile = await container.repo.get_profile(student_id)
    weak_topics = list(profile.get("weak_topics") or [])
    topic_hint = weak_topics[0] if weak_topics else "exam preparation"
    matches: list[dict] = []
    try:
        matches = await container.vector_store.query(
            topic_hint,
            container.embedding,
            top_k=1,
        )
    except Exception:
        matches = []

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
