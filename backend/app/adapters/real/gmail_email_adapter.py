from __future__ import annotations

import asyncio
import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from app.adapters.real.google_auth_helper import (
    build_gmail_service,
    credentials_file_usable,
)
from app.ports.email_port import EmailPort

logger = logging.getLogger(__name__)


class GmailEmailAdapter(EmailPort):
    """Sends HTML mail via Gmail API when delegated sender is configured.

    Without GOOGLE_DELEGATED_USER (Workspace domain-wide delegation), writes a
    local preview file and records stub delivery — never pretends Gmail succeeded.
    """

    def __init__(
        self,
        credentials_path: str = "",
        *,
        delegated_user: str = "",
        outbox_dir: str = "./var/email_outbox",
    ) -> None:
        self.credentials_path = credentials_path
        self.delegated_user = (delegated_user or "").strip()
        self.outbox_dir = Path(outbox_dir)
        self.sent: list[dict] = []
        self.last_delivery: dict[str, Any] = {
            "mode": "stub",
            "detail": "not attempted",
        }

    @property
    def is_configured(self) -> bool:
        return credentials_file_usable(self.credentials_path) and bool(self.delegated_user)

    async def send(
        self,
        to: str,
        subject: str,
        body_html: str,
        *,
        ics_content: str | None = None,
        ics_filename: str = "tele-exit-practice.ics",
    ) -> None:
        preview_path = await asyncio.to_thread(
            self._write_preview, to, subject, body_html
        )

        if self.is_configured:
            try:
                await asyncio.to_thread(
                    self._send_gmail, to, subject, body_html, ics_content, ics_filename
                )
                self.last_delivery = {
                    "mode": "live",
                    "detail": f"Sent via Gmail as {self.delegated_user}"
                    + (" (calendar invite attached)" if ics_content else ""),
                    "preview_path": str(preview_path) if preview_path else None,
                }
                self.sent.append(
                    {
                        "to": to,
                        "subject": subject,
                        "body_html": body_html,
                        "delivery": "live",
                        "has_ics": bool(ics_content),
                    }
                )
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gmail send failed: %s", exc)
                self.last_delivery = {
                    "mode": "stub",
                    "detail": (
                        f"Gmail send failed ({_short_err(exc)}). "
                        f"Preview saved locally"
                        + (f" at {preview_path}" if preview_path else "")
                        + "."
                    ),
                    "preview_path": str(preview_path) if preview_path else None,
                }
        else:
            reason = (
                "Configure SMTP_USER/SMTP_PASSWORD for demo email, "
                "or GOOGLE_DELEGATED_USER for Workspace Gmail."
                if credentials_file_usable(self.credentials_path)
                else "Email not configured — set SMTP_USER and SMTP_PASSWORD for a real demo."
            )
            self.last_delivery = {
                "mode": "stub",
                "detail": (
                    f"{reason} Preview saved"
                    + (f" at {preview_path}" if preview_path else "")
                    + "."
                ),
                "preview_path": str(preview_path) if preview_path else None,
            }

        self.sent.append(
            {
                "to": to,
                "subject": subject,
                "body_html": body_html,
                "delivery": "stub",
                "preview_path": str(preview_path) if preview_path else None,
                "has_ics": bool(ics_content),
            }
        )

    def _write_preview(self, to: str, subject: str, body_html: str) -> Path | None:
        try:
            self.outbox_dir.mkdir(parents=True, exist_ok=True)
            safe = "".join(c if c.isalnum() or c in "-_@" else "_" for c in to)[:48]
            path = self.outbox_dir / f"report_{safe}_{uuid_stamp()}.html"
            doc = (
                "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                f"<title>{_escape(subject)}</title></head><body>"
                f"<p><strong>To:</strong> {_escape(to)}<br>"
                f"<strong>Subject:</strong> {_escape(subject)}</p><hr>"
                f"{body_html}</body></html>"
            )
            path.write_text(doc, encoding="utf-8")
            return path
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not write email preview: %s", exc)
            return None

    def _send_gmail(
        self,
        to: str,
        subject: str,
        body_html: str,
        ics_content: str | None,
        ics_filename: str,
    ) -> None:
        from email.mime.application import MIMEApplication

        service = build_gmail_service(
            self.credentials_path, subject=self.delegated_user
        )
        message = MIMEMultipart("mixed")
        message["to"] = to
        message["from"] = self.delegated_user
        message["subject"] = subject
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body_html, "html", "utf-8"))
        message.attach(alt)
        if ics_content:
            part = MIMEApplication(ics_content.encode("utf-8"), Name=ics_filename)
            part.add_header(
                "Content-Type", "text/calendar; method=REQUEST; charset=UTF-8"
            )
            part.add_header("Content-Disposition", "attachment", filename=ics_filename)
            message.attach(part)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service.users().messages().send(userId="me", body={"raw": raw}).execute()


def uuid_stamp() -> str:
    import time
    import uuid

    return f"{int(time.time())}_{uuid.uuid4().hex[:8]}"


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _short_err(exc: BaseException) -> str:
    text = str(exc)
    if "accessNotConfigured" in text or "has not been used" in text:
        return "Gmail API is disabled in Google Cloud — enable gmail.googleapis.com"
    if "unauthorized_client" in text or "delegation" in text.lower():
        return "domain-wide delegation not set up for GOOGLE_DELEGATED_USER"
    return text[:160]
