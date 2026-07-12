from __future__ import annotations

import logging

import httpx

from app.ports.embedding_port import EmbeddingPort

logger = logging.getLogger(__name__)

# Prefer current Gemini embedding model; keep legacy as fallback.
_DEFAULT_MODELS = (
    "gemini-embedding-001",
    "text-embedding-004",
)


class GeminiEmbeddingAdapter(EmbeddingPort):
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-embedding-001",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self._models = (model,) + tuple(m for m in _DEFAULT_MODELS if m != model)

    async def embed(self, text: str) -> list[float]:
        if not self.api_key:
            return _local_embedding(text)

        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=60.0) as client:
            for model in self._models:
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:embedContent"
                )
                payload = {
                    "model": f"models/{model}",
                    "content": {"parts": [{"text": text}]},
                }
                try:
                    response = await client.post(
                        url,
                        params={"key": self.api_key},
                        json=payload,
                    )
                    if response.status_code == 404:
                        last_error = httpx.HTTPStatusError(
                            f"Embedding model not found: {model}",
                            request=response.request,
                            response=response,
                        )
                        continue
                    response.raise_for_status()
                    data = response.json()
                    values = data.get("embedding", {}).get("values")
                    if not values:
                        raise ValueError(f"Empty embedding response for model {model}")
                    self.model = model
                    return list(values)
                except Exception as exc:
                    last_error = exc
                    logger.warning("Gemini embed failed for %s: %s", model, exc)

        logger.error(
            "All Gemini embedding models failed (%s); using local fallback",
            last_error,
        )
        return _local_embedding(text)


def _local_embedding(text: str) -> list[float]:
    tokens = text.lower().split()
    return [
        float(len(tokens)),
        float(len(text)),
        float(sum(map(ord, text[:20]))),
    ]
