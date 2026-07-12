from datetime import (
    datetime,
    timedelta,
    timezone,
)

from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort


async def run_report_saga(
    student_id: str,
    repo: RepositoryPort,
    llm_port: LLMPort,
) -> str:
    profile = await repo.get_profile(student_id)
    if not profile:
        raise ValueError(f"No profile for student {student_id}")

    summaries = []
    try:
        summaries = await repo.list_session_summaries(student_id, limit=3)
    except Exception:
        summaries = []
    recent_bits = "; ".join(
        f"{s.get('exam_title')}: visited {s.get('questions_visited')}"
        for s in summaries[:3]
    )

    report_text = await llm_port.generate(
        "Write a short, encouraging HTML progress report (2–3 short paragraphs). "
        "No markdown fences.\n"
        f"Student: {profile.get('name')}\n"
        f"Weak topics: {profile.get('weak_topics')}.\n"
        f"Scores: {profile.get('topic_scores')}.\n"
        f"Sessions completed: {profile.get('sessions_completed')}.\n"
        f"Recent study: {recent_bits or 'getting started'}."
    )
    body = (report_text or "").strip() or (
        "<p>You're making steady progress on Tele-Exit. "
        "Keep practicing your weaker topics and come back for another study call.</p>"
    )
    await repo.write_outbox_record(
        "send_report_email",
        {
            "to": profile.get("email", ""),
            "subject": "Your Tele-Exit Progress Report",
            "body_html": body,
        },
    )

    base = datetime.now(timezone.utc).replace(tzinfo=None)
    for index, topic in enumerate(list(profile.get("weak_topics") or [])[:3]):
        start = base + timedelta(days=index + 1)
        start_iso = start.replace(
            hour=9,
            minute=0,
            second=0,
            microsecond=0,
        ).isoformat()
        await repo.write_outbox_record(
            "create_calendar_event",
            {
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": 30,
            },
        )
    return body
