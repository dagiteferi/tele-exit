"""Shared Google service-account helpers for Calendar / Gmail."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

CALENDAR_SCOPES = ("https://www.googleapis.com/auth/calendar",)
GMAIL_SCOPES = ("https://www.googleapis.com/auth/gmail.send",)


def credentials_file_usable(path: str) -> bool:
    if not path:
        return False
    p = Path(path)
    return p.is_file() and p.stat().st_size > 20


def load_service_credentials(
    credentials_path: str,
    scopes: tuple[str, ...],
    *,
    subject: str | None = None,
):
    """Load service-account credentials; optionally impersonate a Workspace user."""
    from google.oauth2 import service_account

    if not credentials_file_usable(credentials_path):
        raise FileNotFoundError(f"Google credentials not found: {credentials_path}")

    creds = service_account.Credentials.from_service_account_file(
        credentials_path,
        scopes=list(scopes),
    )
    if subject and subject.strip():
        creds = creds.with_subject(subject.strip())
    return creds


def build_calendar_service(credentials_path: str, *, subject: str | None = None):
    from googleapiclient.discovery import build

    creds = load_service_credentials(
        credentials_path, CALENDAR_SCOPES, subject=subject
    )
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def build_gmail_service(credentials_path: str, *, subject: str):
    from googleapiclient.discovery import build

    if not subject.strip():
        raise ValueError("GOOGLE_DELEGATED_USER is required to send Gmail")
    creds = load_service_credentials(
        credentials_path, GMAIL_SCOPES, subject=subject
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)
