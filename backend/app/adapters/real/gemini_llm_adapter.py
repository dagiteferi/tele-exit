from __future__ import annotations

import json

import httpx

from app.ports.llm_port import LLMPort


class GeminiLLMAdapter(LLMPort):
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
    ) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self.api_key = api_key
        self.model = model
        self._base = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )

    async def generate(self, prompt: str, system: str = "") -> str:
        contents = []
        if system:
            contents.append({"role": "user", "parts": [{"text": f"System: {system}"}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        payload = {"contents": contents}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self._base,
                params={"key": self.api_key},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return _extract_text(data)

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
