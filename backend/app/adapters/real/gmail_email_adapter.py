from __future__ import annotations

from app.ports.email_port import EmailPort


class GmailEmailAdapter(EmailPort):
    """Records outbound mail. Swap transport to Gmail API when credentials exist."""

    def __init__(self, credentials_path: str = "") -> None:
        self.credentials_path = credentials_path
        self.sent: list[dict] = []

    async def send(self, to: str, subject: str, body_html: str) -> None:
        self.sent.append(
            {
                "to": to,
                "subject": subject,
                "body_html": body_html,
                "credentials_path": self.credentials_path,
            }
        )
