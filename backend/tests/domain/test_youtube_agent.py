import pytest

from app.domain.agents.types import AgentState
from app.domain.agents.youtube_agent import YouTubeAgent
from tests.fakes import (
    FakeLLM,
    FakeVideoSearch,
)


@pytest.mark.asyncio
async def test_youtube_recommends_video():
    video = {
        "title": "Dijkstra Walkthrough",
        "url": "https://youtube.com/watch?v=dijk",
        "timestamp": "1:20",
        "description": "Shortest paths",
    }
    llm = FakeLLM(response="Watch this Dijkstra clip starting at 1:20.")
    search = FakeVideoSearch(video)
    agent = YouTubeAgent(llm, search)
    result = await agent.handle(
        AgentState(
            student_id="s1",
            transcript="show a video on Dijkstra",
            context={"topic": "Dijkstra"},
        )
    )

    assert result.agent_used == "youtube"
    assert result.action == "finding_video"
    assert result.metadata["video"] == video
    assert search.calls == ["Dijkstra"]
    assert "Dijkstra Walkthrough" in llm.generate_calls[0][0]


@pytest.mark.asyncio
async def test_youtube_falls_back_to_transcript_as_topic():
    search = FakeVideoSearch()
    agent = YouTubeAgent(FakeLLM(response="ok"), search)
    await agent.handle(AgentState(student_id="s1", transcript="graphs video"))
    assert search.calls == ["graphs video"]


@pytest.mark.asyncio
async def test_youtube_requires_inputs():
    agent = YouTubeAgent(FakeLLM(), FakeVideoSearch())
    with pytest.raises(ValueError, match="student_id"):
        await agent.handle(AgentState(student_id="", transcript="q"))
    with pytest.raises(ValueError, match="transcript"):
        await agent.handle(AgentState(student_id="s1", transcript=""))
