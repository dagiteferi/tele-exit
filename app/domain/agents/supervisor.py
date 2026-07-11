from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.models import Intent
from app.ports.interfaces import LLMPort


_VALID_INTENTS = {intent.value for intent in Intent}


class Supervisor:
    def __init__(self, llm: LLMPort) -> None:
        self._llm = llm

    async def classify(self, transcript: str) -> Intent:
        raw = (await self._llm.classify_intent(transcript)).strip().lower()
        if raw not in _VALID_INTENTS:
            return Intent.CURRICULUM
        return Intent(raw)

    async def route(self, state: AgentState) -> Intent:
        if not state.student_id:
            raise ValueError("student_id is required on AgentState")
        if not state.transcript.strip():
            raise ValueError("transcript is required on AgentState")
        return await self.classify(state.transcript)

    async def thinking_indicator(self) -> AgentResult:
        return AgentResult(
            text="",
            agent_used="supervisor",
            action="thinking",
        )
