"""Build RFC5545 .ics calendar invites for demo email delivery."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone


def build_study_ics(
    *,
    topic: str,
    start_iso: str,
    duration_minutes: int,
    attendee_email: str,
    organizer_email: str,
) -> str:
    start = _parse_start(start_iso)
    end = start + timedelta(minutes=max(15, int(duration_minutes or 30)))
    uid = f"{uuid.uuid4()}@tele-exit.local"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    summary = _fold(f"Tele-Exit practice: {topic}")
    description = _fold(
        "Practice session from Tele-Exit. Open the app Exams page to continue studying."
    )
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tele-Exit//Study Invite//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"ORGANIZER:mailto:{organizer_email}",
        f"ATTENDEE;CN={attendee_email};RSVP=TRUE:mailto:{attendee_email}",
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    return "\r\n".join(lines)


def _parse_start(start_iso: str) -> datetime:
    raw = (start_iso or "").strip()
    if not raw:
        return datetime.now(timezone.utc) + timedelta(days=1)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return datetime.now(timezone.utc) + timedelta(days=1)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _fold(text: str) -> str:
    cleaned = (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )
    return cleaned[:200]
