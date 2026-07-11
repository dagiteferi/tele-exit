from app.domain.agents.types import (
    AgentResult,
    AgentState,
)
from app.domain.prompts import (
    YOUTUBE_SYSTEM,
    youtube_user_prompt,
)
from app.ports.llm_port import LLMPort
from app.ports.video_search_port import VideoSearchPort


class YouTubeAgent:
    def __init__(
        self,
        llm: LLMPort,
        video_search: VideoSearchPort,
    ) -> None:
        self._llm = llm
        self._video_search = video_search

    async def handle(self, state: AgentState) -> AgentResult:
        if not state.student_id:
            raise ValueError("student_id is required")
        if not state.transcript.strip():
            raise ValueError("transcript is required")

        topic = state.context.get("topic") or state.transcript
        video = await self._video_search.find_video(topic)
        text = await self._llm.generate(
            youtube_user_prompt(
                transcript=state.transcript,
                title=video.get("title", "Untitled video"),
                url=video.get("url", ""),
                timestamp=video.get("timestamp", "0:00"),
                description=video.get("description", ""),
            ),
            system=YOUTUBE_SYSTEM,
        )
        return AgentResult(
            text=text,
            agent_used="youtube",
            action="finding_video",
            metadata={"video": video},
        )
