from __future__ import annotations

import httpx

from app.ports.embedding_port import EmbeddingPort


class GeminiEmbeddingAdapter(EmbeddingPort):
    def __init__(
        self,
        api_key: str,
        model: str = "text-embedding-004",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self._url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:embedContent"
        )

    async def embed(self, text: str) -> list[float]:
        if not self.api_key:
            tokens = text.lower().split()
            return [
                float(len(tokens)),
                float(len(text)),
                float(sum(map(ord, text[:20]))),
            ]

        payload = {
            "model": f"models/{self.model}",
            "content": {"parts": [{"text": text}]},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self._url,
                params={"key": self.api_key},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return list(data["embedding"]["values"])
