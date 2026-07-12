from pathlib import Path
from typing import Any

from app.ports.email_port import EmailPort


class FakeEmail(EmailPort):
    def __init__(self, outbox_dir: str = "./var/email_outbox") -> None:
        self.sent: list[dict] = []
        self.outbox_dir = Path(outbox_dir)
        self.last_delivery: dict[str, Any] = {
            "mode": "stub",
            "detail": "Fake email (USE_FAKES=true) — nothing left your inbox.",
        }

    async def send(
        self,
        to: str,
        subject: str,
        body_html: str,
        *,
        ics_content: str | None = None,
        ics_filename: str = "tele-exit-practice.ics",
    ) -> None:
        preview_path = None
        try:
            self.outbox_dir.mkdir(parents=True, exist_ok=True)
            safe = "".join(c if c.isalnum() or c in "-_@" else "_" for c in to)[:48]
            preview_path = self.outbox_dir / f"fake_report_{safe}.html"
            preview_path.write_text(
                f"<h1>{subject}</h1><p>To: {to}</p><hr>{body_html}",
                encoding="utf-8",
            )
            if ics_content:
                (self.outbox_dir / f"fake_{safe}.ics").write_text(ics_content, encoding="utf-8")
        except Exception:
            preview_path = None
        self.sent.append(
            {
                "to": to,
                "subject": subject,
                "body_html": body_html,
                "preview_path": str(preview_path) if preview_path else None,
                "has_ics": bool(ics_content),
                "ics_filename": ics_filename,
            }
        )
        self.last_delivery = {
            "mode": "stub",
            "detail": (
                "Fake email (USE_FAKES=true) — report was not sent to a real inbox."
                + (f" Preview: {preview_path}" if preview_path else "")
            ),
            "preview_path": str(preview_path) if preview_path else None,
        }
