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
) -> None:
    profile = await repo.get_profile(student_id)
    if not profile:
        raise ValueError(f"No profile for student {student_id}")

    report_text = await llm_port.generate(
        "Write a short, encouraging progress report. "
        f"Weak topics: {profile.get('weak_topics')}. "
        f"Scores: {profile.get('topic_scores')}."
    )
    await repo.write_outbox_record(
        "send_report_email",
        {
            "to": profile.get("email", ""),
            "subject": "Your Tele-Exit Progress Report",
            "body_html": report_text,
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
