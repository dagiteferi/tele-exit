from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.adapters.real.google_auth_helper import (
    build_calendar_service,
    credentials_file_usable,
)
from app.ports.calendar_port import CalendarPort

logger = logging.getLogger(__name__)


class GoogleCalendarAdapter(CalendarPort):
    """Creates study events via Google Calendar API when credentials work.

    Falls back to a local stub id when Google is unavailable so Tele-Exit still
    records acceptance — callers should read `last_delivery` for honesty.
    """

    def __init__(
        self,
        credentials_path: str = "",
        *,
        calendar_id: str = "primary",
        delegated_user: str = "",
    ) -> None:
        self.credentials_path = credentials_path
        self.calendar_id = calendar_id or "primary"
        self.delegated_user = (delegated_user or "").strip()
        self.events: list[dict] = []
        self.last_delivery: dict[str, Any] = {
            "mode": "stub",
            "detail": "not attempted",
        }

    @property
    def is_configured(self) -> bool:
        return credentials_file_usable(self.credentials_path)

    async def create_study_event(
        self,
        student_id: str,
        topic: str,
        start_iso: str,
        duration_minutes: int,
        attendee_email: str | None = None,
    ) -> str:
        if self.is_configured:
            try:
                event_id = await asyncio.to_thread(
                    self._insert_google_event,
                    topic,
                    start_iso,
                    duration_minutes,
                    attendee_email,
                )
                self.last_delivery = {
                    "mode": "live",
                    "detail": (
                        f"Created on Google Calendar"
                        + (
                            f" and invited {attendee_email}"
                            if attendee_email
                            else ""
                        )
                    ),
                    "html_link": self.events[-1].get("html_link") if self.events else None,
                }
                return event_id
            except Exception as exc:  # noqa: BLE001
                logger.warning("Google Calendar create failed: %s", exc)
                self.last_delivery = {
                    "mode": "stub",
                    "detail": f"Google Calendar failed ({_short_err(exc)}). Saved in Tele-Exit only.",
                }
        else:
            self.last_delivery = {
                "mode": "stub",
                "detail": "Google credentials not configured. Saved in Tele-Exit only.",
            }

        event_id = f"stub-gcal-{uuid.uuid4()}"
        self.events.append(
            {
                "id": event_id,
                "student_id": student_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": duration_minutes,
                "credentials_path": self.credentials_path,
                "delivery": "stub",
            }
        )
        return event_id

    def _insert_google_event(
        self,
        topic: str,
        start_iso: str,
        duration_minutes: int,
        attendee_email: str | None,
    ) -> str:
        service = build_calendar_service(
            self.credentials_path,
            subject=self.delegated_user or None,
        )
        start = _parse_start(start_iso)
        end = start + timedelta(minutes=max(15, int(duration_minutes or 30)))
        body: dict[str, Any] = {
            "summary": f"Tele-Exit practice: {topic}",
            "description": (
                "Practice session suggested by Tele-Exit after your study wrap-up.\n"
                "Open Tele-Exit → Exams to continue practicing."
            ),
            "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        }
        if attendee_email and "@" in attendee_email and self.delegated_user:
            # Service accounts cannot invite attendees without domain-wide delegation.
            body["attendees"] = [{"email": attendee_email.strip()}]

        created = (
            service.events()
            .insert(
                calendarId=self.calendar_id,
                body=body,
                sendUpdates="all" if body.get("attendees") else "none",
            )
            .execute()
        )
        event_id = str(created.get("id") or f"gcal-{uuid.uuid4()}")
        self.events.append(
            {
                "id": event_id,
                "topic": topic,
                "start_iso": start_iso,
                "duration_minutes": duration_minutes,
                "html_link": created.get("htmlLink"),
                "delivery": "live",
            }
        )
        return event_id


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


def _short_err(exc: BaseException) -> str:
    text = str(exc)
    if "accessNotConfigured" in text or "has not been used" in text:
        return "Calendar API is disabled in Google Cloud — enable calendar-json.googleapis.com"
    if "insufficient" in text.lower() or "403" in text:
        return "permission denied — share a calendar with the service account or set GOOGLE_DELEGATED_USER"
    return text[:160]
