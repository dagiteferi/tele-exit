from __future__ import annotations

import asyncio
import json
import logging

import httpx

from app.ports.llm_port import LLMPort

logger = logging.getLogger(__name__)

# Prefer currently available fast models; skip retired/rate-limited ones first.
_DEFAULT_MODELS = (
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
)


class GeminiLLMAdapter(LLMPort):
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-flash-lite-latest",
        models: tuple[str, ...] | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self.api_key = api_key
        self.model = model
        ordered = [model, *(models or _DEFAULT_MODELS)]
        # de-dupe while preserving order
        seen: set[str] = set()
        self.models = tuple(m for m in ordered if not (m in seen or seen.add(m)))
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate(self, prompt: str, system: str = "") -> str:
        last_error: Exception | None = None
        for model in self.models:
            try:
                return await self._generate_once(model, prompt, system)
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status = exc.response.status_code
                logger.warning("Gemini %s failed (%s)", model, status)
                # Don't burn quota sitting on 429 — move to next model quickly.
                if status == 429:
                    await asyncio.sleep(0.15)
                    continue
                # Skip unavailable / blocked models instead of aborting the whole loop.
                if status in {400, 403, 404, 503}:
                    continue
                continue
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                logger.warning("Gemini %s transport error: %s", model, exc)
                continue
        if last_error:
            raise last_error
        return ""

    async def stream_generate(self, prompt: str, system: str = ""):
        """Yield text deltas from Gemini streamGenerateContent (SSE)."""
        last_error: Exception | None = None
        for model in self.models:
            try:
                async for delta in self._stream_once(model, prompt, system):
                    yield delta
                return
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status = exc.response.status_code
                logger.warning("Gemini stream %s failed (%s)", model, status)
                if status == 429:
                    await asyncio.sleep(0.15)
                    continue
                if status in {400, 403, 404, 503}:
                    continue
                continue
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                logger.warning("Gemini stream %s transport error: %s", model, exc)
                continue
        if last_error:
            raise last_error

    async def _generate_once(self, model: str, prompt: str, system: str) -> str:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        payload = self._payload(prompt, system, max_tokens=160)
        response = await self._client.post(
            url,
            params={"key": self.api_key},
            json=payload,
        )
        response.raise_for_status()
        return _extract_text(response.json())

    async def _stream_once(self, model: str, prompt: str, system: str):
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:streamGenerateContent"
        )
        payload = self._payload(prompt, system, max_tokens=220)
        async with self._client.stream(
            "POST",
            url,
            params={"key": self.api_key, "alt": "sse"},
            json=payload,
            timeout=httpx.Timeout(20.0, connect=4.0),
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                piece = _extract_stream_delta(data)
                if piece:
                    yield piece

    def _payload(self, prompt: str, system: str, *, max_tokens: int) -> dict:
        payload: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.35,
                "maxOutputTokens": max_tokens,
            },
        }
        if system.strip():
            payload["systemInstruction"] = {"parts": [{"text": system.strip()}]}
        return payload

    async def classify_intent(self, transcript: str) -> str:
        prompt = (
            "Classify the student intent as exactly one of: "
            "curriculum, search, youtube.\n"
            f"Transcript: {transcript}\n"
            "Reply with only the label."
        )
        raw = (await self.generate(prompt)).strip().lower()
        for label in ("curriculum", "search", "youtube"):
            if label in raw:
                return label
        return "curriculum"


def _extract_text(data: dict) -> str:
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return json.dumps(data)


def _extract_stream_delta(data: dict) -> str:
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(str(p.get("text") or "") for p in parts)
    except (KeyError, IndexError, TypeError):
        return ""
