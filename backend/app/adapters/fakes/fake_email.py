from app.ports.email_port import EmailPort


class FakeEmail(EmailPort):
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send(self, to: str, subject: str, body_html: str) -> None:
        self.sent.append(
            {
                "to": to,
                "subject": subject,
                "body_html": body_html,
            }
        )
