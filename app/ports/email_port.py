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
    ) -> None: ...
