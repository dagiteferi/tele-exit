import os

from app.adapters.fakes.fake_llm import FakeLLM
from app.adapters.fakes.fake_search import FakeSearch
from app.adapters.fakes.fake_vector_search import (
    FakeEmbedding,
    FakeVectorSearch,
)
from app.adapters.fakes.fake_video_search import FakeVideoSearch
from app.adapters.real.sqlite_repository_adapter import SQLiteRepositoryAdapter


def build_container() -> dict:
    use_fakes = os.getenv("USE_FAKES", "true").lower() == "true"
    db_path = os.getenv("DB_PATH", "./tele_exit.db")

    if use_fakes:
        llm = FakeLLM()
        search = FakeSearch()
        video_search = FakeVideoSearch()
        embedding = FakeEmbedding()
        vector_store = FakeVectorSearch()
    else:
        raise RuntimeError(
            "Real adapters are not wired yet. Set USE_FAKES=true for local development."
        )

    repo = SQLiteRepositoryAdapter(db_path=db_path)
    return {
        "llm": llm,
        "search": search,
        "video_search": video_search,
        "embedding": embedding,
        "vector_store": vector_store,
        "repo": repo,
    }


_container: dict | None = None


def get_container() -> dict:
    global _container
    if _container is None:
        _container = build_container()
    return _container


def reset_container() -> None:
    global _container
    _container = None
