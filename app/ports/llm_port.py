from abc import (
    ABC,
    abstractmethod,
)


class LLMPort(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system: str = "") -> str: ...

    @abstractmethod
    async def classify_intent(self, transcript: str) -> str: ...
