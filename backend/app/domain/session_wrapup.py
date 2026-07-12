"""Build post-session summary + AI calendar study recommendations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort

DEFAULT_STUDY_MINUTES = 30
MAX_RECOMMENDATIONS = 3


async def wrap_up_session(
    *,
    student_id: str,
    repo: RepositoryPort,
    llm: LLMPort,
    attempt_id: str | None = None,
    exam_id: str | None = None,
    exam_title: str = "",
    question_ids: list[str] | None = None,
    events: list[dict[str, Any]] | None = None,
    questions_visited: int | None = None,
    persist_events: bool = True,
) -> dict[str, Any]:
    """Record practice outcomes, save a summary, and propose calendar sessions."""
    events = list(events or [])
    question_ids = list(question_ids or [])

    # Resolve topics for visited questions when events weren't provided.
    topics: list[str] = []
    if attempt_id and (question_ids or events):
        attempt = await repo.get_exam_attempt(attempt_id)
        if attempt is None or attempt["student_id"] != student_id:
            raise ValueError("Attempt not found")
        exam_id = exam_id or attempt.get("exam_id")
        bank = await repo.list_exam_questions(attempt["exam_id"])
        by_id = {q["id"]: q for q in bank}
        if not exam_title:
            exam = await repo.get_exam(attempt["exam_id"])
            exam_title = (exam or {}).get("title") or "Practice exam"

        if not events and question_ids:
            for qid in question_ids:
                q = by_id.get(qid)
                if not q:
                    continue
                topic = str(q.get("topic") or "General")
                topics.append(topic)
        else:
            for ev in events:
                q = by_id.get(ev.get("question_id"))
                if q and not ev.get("topic"):
                    ev["topic"] = q.get("topic") or "General"
                topics.append(str(ev.get("topic") or "General"))

    scored_events = [e for e in events if e.get("question_id")]
    if persist_events:
        for ev in scored_events:
            await repo.record_session_event(
                {
                    "student_id": student_id,
                    "question_id": ev["question_id"],
                    "topic": ev.get("topic") or "General",
                    "student_answer_transcript": ev.get("student_answer_transcript") or "",
                    "was_correct": bool(ev.get("was_correct")),
                    "agent_used": ev.get("agent_used") or "curriculum",
                }
            )

    profile = await repo.get_profile(student_id)
    if profile:
        profile["sessions_completed"] = int(profile.get("sessions_completed", 0)) + 1
        profile["last_session_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        await repo.save_profile(profile)
        profile = await repo.get_profile(student_id)

    correct = sum(1 for e in scored_events if e.get("was_correct"))
    attempted = len(scored_events)
    visited = questions_visited if questions_visited is not None else max(len(question_ids), attempted, 1)
    unique_topics = []
    for t in topics:
        if t and t not in unique_topics:
            unique_topics.append(t)

    weak = list((profile or {}).get("weak_topics") or [])
    focus = []
    for t in unique_topics + weak:
        if t and t not in focus:
            focus.append(t)
        if len(focus) >= MAX_RECOMMENDATIONS:
            break
    if not focus:
        focus = unique_topics[:MAX_RECOMMENDATIONS] or ["General exam review"]

    summary_text = await _compose_summary(
        llm,
        exam_title=exam_title,
        visited=visited,
        correct=correct,
        attempted=attempted,
        topics=unique_topics,
        weak=weak,
    )

    summary = await repo.save_session_summary(
        {
            "student_id": student_id,
            "attempt_id": attempt_id,
            "exam_id": exam_id,
            "exam_title": exam_title or "Practice session",
            "questions_visited": visited,
            "questions_attempted": attempted,
            "questions_correct": correct,
            "topics": unique_topics,
            "summary_text": summary_text,
        }
    )

    recommendations = await propose_calendar_sessions(
        repo,
        student_id=student_id,
        topics=focus,
    )

    return {
        "summary": summary,
        "recommendations": recommendations,
        "weak_topics": weak,
        "readiness_percent": int((profile or {}).get("readiness_percent") or 0),
        "sessions_completed": int((profile or {}).get("sessions_completed") or 0),
    }


async def propose_calendar_sessions(
    repo: RepositoryPort,
    *,
    student_id: str,
    topics: list[str],
) -> list[dict]:
    """Create suggested (not yet accepted) calendar study blocks."""
    created: list[dict] = []
    base = datetime.now(timezone.utc).replace(tzinfo=None)
    for index, topic in enumerate(topics[:MAX_RECOMMENDATIONS]):
        start = base + timedelta(days=index + 1)
        start_iso = start.replace(hour=9, minute=0, second=0, microsecond=0).isoformat()
        row = await repo.create_calendar_suggestion(
            student_id=student_id,
            topic=topic,
            start_iso=start_iso,
            duration_minutes=DEFAULT_STUDY_MINUTES,
        )
        created.append(row)
    return created


async def _compose_summary(
    llm: LLMPort,
    *,
    exam_title: str,
    visited: int,
    correct: int,
    attempted: int,
    topics: list[str],
    weak: list[str],
) -> str:
    prompt = (
        "Write 2 short sentences for a student after an exit-exam study session. "
        "Be warm and specific. No markdown.\n"
        f"Exam: {exam_title}\n"
        f"Questions visited: {visited}\n"
        f"Answered: {attempted}, correct: {correct}\n"
        f"Topics covered: {', '.join(topics) or 'general review'}\n"
        f"Weak topics still to watch: {', '.join(weak) or 'none yet'}\n"
    )
    try:
        text = await llm.generate(prompt)
        cleaned = (text or "").strip()
        if cleaned:
            return cleaned[:500]
    except Exception:
        pass
    topic_bit = ", ".join(topics[:3]) if topics else "your exam topics"
    if attempted:
        return (
            f"Nice work on {exam_title} — you covered {visited} question(s) "
            f"and got {correct}/{attempted} right. Keep building on {topic_bit}."
        )
    return (
        f"Solid session on {exam_title} — you moved through {visited} question(s) "
        f"on {topic_bit}. Come back tomorrow and lock those ideas in."
    )
