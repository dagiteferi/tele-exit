from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.prompts import (
    NO_SEARCH_RESULTS,
    SEARCH_SYSTEM,
    format_search_result,
    search_user_prompt,
)
from app.ports.llm_port import LLMPort
from app.ports.web_search_port import WebSearchPort


class SearchAgent:
    def __init__(
        self,
        llm: LLMPort,
        search: WebSearchPort,
    ) -> None:
        self._llm = llm
        self._search = search

    async def handle(self, state: AgentState) -> AgentResult:
        if not state.student_id:
            raise ValueError("student_id is required")
        if not state.transcript.strip():
            raise ValueError("transcript is required")

        results = await self._search.search(state.transcript)
        if not results:
            return AgentResult(
                text=NO_SEARCH_RESULTS,
                agent_used="search",
                action="searching_web",
                metadata={"results": []},
            )

        digest = "\n".join(
            format_search_result(
                title=item.get("title", "Untitled"),
                snippet=item.get("snippet") or item.get("content", ""),
                url=item.get("url", ""),
            )
            for item in results
        )
        text = await self._llm.generate(
            search_user_prompt(state.transcript, digest),
            system=SEARCH_SYSTEM,
        )
        return AgentResult(
            text=text,
            agent_used="search",
            action="searching_web",
            metadata={"results": results},
        )
