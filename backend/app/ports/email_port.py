from abc import (
    ABC,
    abstractmethod,
)


class EmailPort(ABC):
    @abstractmethod
    async def send(
        self,
        to: str,
        subject: str,
        body_html: str,
        *,
        ics_content: str | None = None,
        ics_filename: str = "tele-exit-practice.ics",
    ) -> None: ...
