from abc import (
    ABC,
    abstractmethod,
)


class VideoSessionPort(ABC):
    @abstractmethod
    async def create_room(self, student_id: str) -> dict: ...
