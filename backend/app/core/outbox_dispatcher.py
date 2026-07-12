from app.ports.calendar_port import CalendarPort
from app.ports.email_port import EmailPort
from app.ports.repository_port import RepositoryPort


async def dispatch_pending_outbox_records(
    repo: RepositoryPort,
    email_port: EmailPort,
    calendar_port: CalendarPort,
) -> int:
    sent = 0
    for record in await repo.get_pending_outbox_records():
        try:
            if record["event_type"] == "send_report_email":
                await email_port.send(**record["payload"])
            elif record["event_type"] == "create_calendar_event":
                payload = dict(record["payload"])
                await calendar_port.create_study_event(
                    student_id=payload["student_id"],
                    topic=payload["topic"],
                    start_iso=payload["start_iso"],
                    duration_minutes=int(payload["duration_minutes"]),
                )
            await repo.mark_outbox_sent(record["id"])
            sent += 1
        except Exception:
            await repo.mark_outbox_failed(record["id"])
    return sent
