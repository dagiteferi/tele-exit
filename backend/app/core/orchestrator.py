from app.domain.agents.curriculum_agent import CurriculumAgent
from app.domain.agents.memory_agent import MemoryAgent
from app.domain.agents.planner_agent import PlannerAgent
from app.domain.agents.search_agent import SearchAgent
from app.domain.agents.supervisor import Supervisor
from app.domain.agents.synthesizer import Synthesizer
from app.domain.agents.types import AgentState
from app.domain.agents.youtube_agent import YouTubeAgent
from app.domain.models import Intent
from app.ports.calendar_port import CalendarPort
from app.ports.embedding_port import EmbeddingPort
from app.ports.llm_port import LLMPort
from app.ports.repository_port import RepositoryPort
from app.ports.vector_store_port import VectorStorePort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort


class Orchestrator:
    def __init__(
        self,
        llm: LLMPort,
        search: WebSearchPort,
        video_search: VideoSearchPort,
        embedding: EmbeddingPort,
        vector_store: VectorStorePort,
        repo: RepositoryPort,
        calendar: CalendarPort,
    ) -> None:
        self.supervisor = Supervisor(llm)
        self.curriculum = CurriculumAgent(llm, embedding, vector_store)
        self.search = SearchAgent(llm, search)
        self.youtube = YouTubeAgent(llm, video_search)
        self.memory = MemoryAgent(repo)
        self.planner = PlannerAgent(repo, calendar)
        self.synthesizer = Synthesizer()

    async def handle_transcript(self, student_id: str, transcript: str) -> list[dict]:
        state = AgentState(student_id=student_id, transcript=transcript)
        messages: list[dict] = []

        intent = await self.supervisor.route(state)
        thinking = await self.supervisor.thinking_indicator()
        if thinking.action:
            messages.append({"type": "action_indicator", "action": thinking.action})

        if intent is Intent.SEARCH:
            result = await self.search.handle(state)
        elif intent is Intent.YOUTUBE:
            result = await self.youtube.handle(state)
        else:
            result = await self.curriculum.handle(state)

        if result.action and result.action != "thinking":
            messages.append({"type": "action_indicator", "action": result.action})

        matches = result.metadata.get("matches") or []
        if matches:
            first = matches[0]
            messages.append(
                {
                    "type": "question_card",
                    "question_id": first.get("id", ""),
                    "topic": first.get("topic", ""),
                    "text": first.get("question_text", ""),
                }
            )

        messages.append(
            {
                "type": "agent_response",
                "text": result.text,
                "agent_used": result.agent_used,
            }
        )
        return messages
