from abc import (
    ABC,
    abstractmethod,
)


class VideoSearchPort(ABC):
    @abstractmethod
    async def find_video(self, topic: str) -> dict: ...
