import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.fakes.fake_vector_search import (
    FakeEmbedding,
    FakeVectorSearch,
)
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter
from app.auth.security import create_access_token
from app.core.di import reset_container
from app.routes.admin_routes import legacy_router as router


@pytest.fixture
def vector_store() -> FakeVectorSearch:
    return FakeVectorSearch()


@pytest.fixture
def client(vector_store: FakeVectorSearch, tmp_path) -> TestClient:
    reset_container()
    app = FastAPI()
    app.include_router(router)
    repo = SQLiteRepositoryAdapter(db_path=str(tmp_path / "test.db"))

    class Container:
        def __init__(self) -> None:
            self.embedding = FakeEmbedding()
            self.vector_store = vector_store
            self.repo = repo

        def __getitem__(self, key: str):
            return getattr(self, key)

    container = Container()

    def override_container():
        return container

    from app.core import di

    app.dependency_overrides[di.get_container] = override_container
    with TestClient(app) as test_client:
        yield test_client
    reset_container()


def test_upload_requires_admin(client: TestClient):
    student_token = create_access_token("s1", role="student")
    response = client.post(
        "/questions/upload",
        headers={"Authorization": f"Bearer {student_token}"},
        files={
            "file": (
                "q.json",
                json.dumps(
                    [
                        {
                            "topic": "Graphs",
                            "year": 2023,
                            "question_text": "Q",
                            "reference_answer": "A",
                        }
                    ]
                ),
                "application/json",
            )
        },
    )
    assert response.status_code == 403


def test_upload_as_admin_ingests_questions(
    client: TestClient,
    vector_store: FakeVectorSearch,
):
    admin_token = create_access_token("admin-1", role="admin")
    payload = [
        {
            "topic": "Graphs",
            "year": 2023,
            "question_text": "What is BFS?",
            "reference_answer": "Breadth-first search",
        },
        {
            "topic": "",
            "year": 2022,
            "question_text": "bad",
            "reference_answer": "bad",
        },
    ]
    response = client.post(
        "/questions/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={
            "file": (
                "questions.json",
                json.dumps(payload),
                "application/json",
            )
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ingested"] == 1
    assert body["skipped"] == 1
    assert len(body["errors"]) == 1
    assert len(vector_store.stored) == 1


def test_upload_rejects_unsupported_file(client: TestClient):
    admin_token = create_access_token("admin-1", role="admin")
    response = client.post(
        "/questions/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
