import pytest

from app.adapters.fakes.fake_vector_search import (
    FakeEmbedding,
    FakeVectorSearch,
)
from app.ingestion.embedding_pipeline import ingest_questions


@pytest.mark.asyncio
async def test_ingest_questions_success():
    store = FakeVectorSearch()
    result = await ingest_questions(
        [
            {
                "topic": "Graphs",
                "year": 2023,
                "question_text": "What is BFS?",
                "reference_answer": "Breadth-first search",
            }
        ],
        FakeEmbedding(),
        store,
    )
    assert result.ingested == 1
    assert result.skipped == 0
    assert result.errors == []
    assert len(store.stored) == 1


@pytest.mark.asyncio
async def test_ingest_skips_invalid_rows_and_continues():
    store = FakeVectorSearch()
    result = await ingest_questions(
        [
            {
                "topic": "Graphs",
                "year": 2023,
                "question_text": "What is BFS?",
                "reference_answer": "Breadth-first search",
            },
            {
                "topic": "",
                "year": "nope",
                "question_text": "",
                "reference_answer": "",
            },
            {
                "topic": "Trees",
                "year": "2022",
                "question_text": "Define a tree",
                "reference_answer": "Acyclic connected graph",
            },
        ],
        FakeEmbedding(),
        store,
    )
    assert result.ingested == 2
    assert result.skipped == 1
    assert len(result.errors) == 1
    assert "row 2" in result.errors[0]
