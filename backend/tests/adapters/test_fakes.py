import pytest

from app.adapters.fakes import (
    FakeEmbedding,
    FakeLLM,
    FakeSearch,
    FakeVectorSearch,
    FakeVideoSearch,
)
from app.domain.models import ExamQuestion
from app.ports.embedding_port import EmbeddingPort
from app.ports.llm_port import LLMPort
from app.ports.vector_store_port import VectorStorePort
from app.ports.video_search_port import VideoSearchPort
from app.ports.web_search_port import WebSearchPort


def test_fakes_implement_ports():
    assert isinstance(FakeLLM(), LLMPort)
    assert isinstance(FakeSearch(), WebSearchPort)
    assert isinstance(FakeVideoSearch(), VideoSearchPort)
    assert isinstance(FakeVectorSearch(), VectorStorePort)
    assert isinstance(FakeEmbedding(), EmbeddingPort)


@pytest.mark.asyncio
async def test_fake_llm_generate_and_classify():
    llm = FakeLLM(intent="curriculum", response="hello")
    assert await llm.generate("prompt", system="sys") == "hello"
    assert await llm.classify_intent("show me a youtube video") == "youtube"
    assert await llm.classify_intent("search this online") == "search"
    assert await llm.classify_intent("how am I doing?") == "memory"
    assert await llm.classify_intent("schedule me for tomorrow") == "planner"
    assert await llm.classify_intent("explain BFS") == "curriculum"
    assert len(llm.generate_calls) == 1
    assert len(llm.classify_calls) == 5


@pytest.mark.asyncio
async def test_fake_search_default_and_fixed_results():
    search = FakeSearch()
    results = await search.search("graphs")
    assert len(results) == 2
    assert "graphs" in results[0]["title"].lower()

    fixed = FakeSearch(results=[{"title": "Only", "snippet": "one", "url": "u"}])
    assert await fixed.search("anything") == [
        {"title": "Only", "snippet": "one", "url": "u"}
    ]


@pytest.mark.asyncio
async def test_fake_video_search_default_and_fixed():
    video_search = FakeVideoSearch()
    video = await video_search.find_video("Dijkstra")
    assert video["title"] == "Dijkstra Explained"
    assert "fake-dijkstra" in video["url"]

    fixed = FakeVideoSearch(video={"title": "Custom", "url": "u", "timestamp": "0:10"})
    assert (await fixed.find_video("x"))["title"] == "Custom"


@pytest.mark.asyncio
async def test_fake_vector_search_store_and_query():
    store = FakeVectorSearch()
    embedding = FakeEmbedding()
    question = ExamQuestion(
        id="q1",
        topic="Graphs",
        year=2023,
        question_text="What is BFS?",
        reference_answer="Breadth-first search",
    )
    vector = await embedding.embed(question.question_text)
    await store.store(question, vector)

    matches = await store.query("explain BFS", embedding, top_k=1)
    assert len(matches) == 1
    assert matches[0]["question_text"] == "What is BFS?"


@pytest.mark.asyncio
async def test_fake_vector_search_preset_matches_and_dict_store():
    preset = FakeVectorSearch(matches=[{"question_text": "preset"}])
    assert await preset.query("x", FakeEmbedding(), top_k=1) == [
        {"question_text": "preset"}
    ]

    store = FakeVectorSearch()
    await store.store(
        {
            "id": "q2",
            "topic": "Trees",
            "question_text": "Define a tree",
            "reference_answer": "Acyclic graph",
        },
        [1.0, 2.0, 3.0],
    )
    assert len(store.stored) == 1


@pytest.mark.asyncio
async def test_fake_vector_search_rejects_bad_question_type():
    store = FakeVectorSearch()
    with pytest.raises(TypeError):
        await store.store("not-a-question", [1.0])
