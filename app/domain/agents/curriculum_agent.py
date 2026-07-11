from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.prompts import (
    CURRICULUM_SYSTEM,
    EMPTY_CURRICULUM_CONTEXT,
    curriculum_user_prompt,
    format_curriculum_match,
)
from app.ports.interfaces import (
    EmbeddingPort,
    LLMPort,
    VectorStorePort,
)


class CurriculumAgent:
    def __init__(
        self,
        llm: LLMPort,
        embedding: EmbeddingPort,
        vector_store: VectorStorePort,
    ) -> None:
        self._llm = llm
        self._embedding = embedding
        self._vector_store = vector_store

    async def handle(self, state: AgentState, top_k: int = 3) -> AgentResult:
        if not state.student_id:
            raise ValueError("student_id is required")
        if not state.transcript.strip():
            raise ValueError("transcript is required")

        matches = await self._vector_store.query(
            state.transcript,
            self._embedding,
            top_k=top_k,
        )
        context_blocks = [
            format_curriculum_match(
                topic=match.get("topic", ""),
                question=match.get("question_text", ""),
                answer=match.get("reference_answer", ""),
            )
            for match in matches
        ]
        context = (
            "\n\n".join(context_blocks)
            if context_blocks
            else EMPTY_CURRICULUM_CONTEXT
        )

        text = await self._llm.generate(
            curriculum_user_prompt(state.transcript, context),
            system=CURRICULUM_SYSTEM,
        )
        return AgentResult(
            text=text,
            agent_used="curriculum",
            action="thinking",
            metadata={
                "matches": matches,
                "match_count": len(matches),
            },
        )
