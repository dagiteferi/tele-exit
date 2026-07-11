from abc import (
    ABC,
    abstractmethod,
)

from app.ports.embedding_port import EmbeddingPort


class VectorStorePort(ABC):
    @abstractmethod
    async def store(self, question, embedding: list[float]) -> None: ...

    @abstractmethod
    async def query(
        self,
        text: str,
        embedding_port: EmbeddingPort,
        top_k: int = 3,
    ) -> list[dict]: ...
