import re

from collections.abc import Iterator

from app.domain.agents.types import AgentResult


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


class Synthesizer:
    def split_sentences(self, text: str) -> list[str]:
        cleaned = " ".join(text.split()).strip()
        if not cleaned:
            return []
        parts = _SENTENCE_SPLIT.split(cleaned)
        return [part.strip() for part in parts if part.strip()]

    def stream_sentences(self, text: str) -> Iterator[str]:
        yield from self.split_sentences(text)

    def synthesize(self, result: AgentResult) -> list[str]:
        return self.split_sentences(result.text)

    def to_tts_chunks(self, result: AgentResult) -> list[dict]:
        return [
            {
                "type": "agent_response_chunk",
                "text": sentence,
                "agent_used": result.agent_used,
                "index": index,
            }
            for index, sentence in enumerate(self.synthesize(result))
        ]
