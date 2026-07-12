import pytest

from app.domain.agents.search_agent import SearchAgent
from app.domain.agents.types import AgentState
from tests.fakes import (
    FakeLLM,
    FakeWebSearch,
)


@pytest.mark.asyncio
async def test_search_summarizes_results():
    results = [
        {
            "title": "BFS Guide",
            "snippet": "Breadth-first search",
            "url": "https://example.com/bfs",
        }
    ]
    llm = FakeLLM(response="Here is a short BFS summary.")
    agent = SearchAgent(llm, FakeWebSearch(results))
    result = await agent.handle(
        AgentState(student_id="s1", transcript="search BFS online")
    )

    assert result.agent_used == "search"
    assert result.action == "searching_web"
    assert result.metadata["results"] == results
    assert "BFS Guide" in llm.generate_calls[0][0]


@pytest.mark.asyncio
async def test_search_empty_results():
    agent = SearchAgent(FakeLLM(), FakeWebSearch([]))
    result = await agent.handle(
        AgentState(student_id="s1", transcript="obscure query")
    )
    assert result.text == "No web results found for that query."
    assert result.metadata["results"] == []


@pytest.mark.asyncio
async def test_search_requires_inputs():
    agent = SearchAgent(FakeLLM(), FakeWebSearch())
    with pytest.raises(ValueError, match="student_id"):
        await agent.handle(AgentState(student_id="", transcript="q"))
    with pytest.raises(ValueError, match="transcript"):
        await agent.handle(AgentState(student_id="s1", transcript=" "))
