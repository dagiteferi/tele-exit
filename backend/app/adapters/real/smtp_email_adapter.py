"""Real SMTP email delivery (Gmail app password works well for demos)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from app.ports.email_port import EmailPort

logger = logging.getLogger(__name__)


class SmtpEmailAdapter(EmailPort):
    """Send real HTML email (and optional .ics) over SMTP."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
        use_tls: bool = True,
        outbox_dir: str = "./var/email_outbox",
    ) -> None:
        self.host = host
        self.port = int(port)
        self.username = username.strip()
        # Gmail App Passwords are 16 chars; strip spaces/quotes from .env pastes.
        self.password = (password or "").strip().strip('"').strip("'").replace(" ", "")
        self.from_email = (from_email or username).strip()
        self.use_tls = use_tls
        self.outbox_dir = Path(outbox_dir)
        self.sent: list[dict] = []
        self.last_delivery: dict[str, Any] = {
            "mode": "stub",
            "detail": "not attempted",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.host and self.username and self.password and self.from_email)

    async def send(
        self,
        to: str,
        subject: str,
        body_html: str,
        *,
        ics_content: str | None = None,
        ics_filename: str = "tele-exit-practice.ics",
    ) -> None:
        if not self.is_configured:
            self.last_delivery = {
                "mode": "stub",
                "detail": "SMTP is not configured (set SMTP_USER / SMTP_PASSWORD).",
            }
            raise RuntimeError("SMTP is not configured")

        preview = await asyncio.to_thread(self._write_preview, to, subject, body_html)
        try:
            await asyncio.to_thread(
                self._smtp_send,
                to,
                subject,
                body_html,
                ics_content,
                ics_filename,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("SMTP send failed")
            self.last_delivery = {
                "mode": "stub",
                "detail": f"SMTP failed ({_short(exc)})."
                + (f" Preview: {preview}" if preview else ""),
                "preview_path": str(preview) if preview else None,
            }
            raise

        self.sent.append(
            {
                "to": to,
                "subject": subject,
                "body_html": body_html,
                "delivery": "live",
                "has_ics": bool(ics_content),
            }
        )
        self.last_delivery = {
            "mode": "live",
            "detail": f"Sent via SMTP to {to}"
            + (" (calendar invite attached)" if ics_content else ""),
            "preview_path": str(preview) if preview else None,
        }

    def _smtp_send(
        self,
        to: str,
        subject: str,
        body_html: str,
        ics_content: str | None,
        ics_filename: str,
    ) -> None:
        msg = MIMEMultipart("mixed")
        msg["From"] = self.from_email
        msg["To"] = to
        msg["Subject"] = subject

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(_html_to_text(body_html), "plain", "utf-8"))
        alt.attach(MIMEText(body_html, "html", "utf-8"))
        msg.attach(alt)

        if ics_content:
            part = MIMEApplication(
                ics_content.encode("utf-8"),
                Name=ics_filename,
            )
            part.add_header("Content-Type", "text/calendar; method=REQUEST; charset=UTF-8")
            part.add_header("Content-Disposition", "attachment", filename=ics_filename)
            msg.attach(part)

        context = ssl.create_default_context()
        with smtplib.SMTP(self.host, self.port, timeout=30) as server:
            if self.use_tls:
                server.starttls(context=context)
            server.login(self.username, self.password)
            server.sendmail(self.from_email, [to], msg.as_string())

    def _write_preview(self, to: str, subject: str, body_html: str) -> Path | None:
        try:
            self.outbox_dir.mkdir(parents=True, exist_ok=True)
            safe = "".join(c if c.isalnum() or c in "-_@" else "_" for c in to)[:48]
            path = self.outbox_dir / f"smtp_{safe}.html"
            path.write_text(
                f"<p><b>To:</b> {to}<br><b>Subject:</b> {subject}</p><hr>{body_html}",
                encoding="utf-8",
            )
            return path
        except Exception:
            return None


def _html_to_text(html: str) -> str:
    import re

    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip() or "Tele-Exit notification"


def _short(exc: BaseException) -> str:
    text = str(exc)
    if "Username and Password not accepted" in text or "BadCredentials" in text:
        return "Gmail rejected login — use an App Password, not your normal password"
    if "Connection refused" in text:
        return "could not connect to SMTP host"
    return text[:160]
