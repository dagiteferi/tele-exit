"""Index product website copy + backend spec into ProductKnowledgeStore."""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from app.adapters.real.product_knowledge_adapter import ProductKnowledgeStore
from app.ingestion.fast_embed import fast_embed

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def _repo_root() -> Path:
    # .../backend/app/ingestion/this_file.py → repo root
    return Path(__file__).resolve().parents[3]


def default_doc_paths() -> list[Path]:
    root = _repo_root()
    backend_docs = Path(__file__).resolve().parents[2] / "docs" / "product"
    paths: list[Path] = []
    website = backend_docs / "website.md"
    if website.is_file():
        paths.append(website)
    # Filename intentionally has a space before .md in this repo.
    spec_candidates = [
        root / "docs" / ".specs" / "Tele-Exit-Backend-Spec-v3 .md",
        root / "docs" / ".specs" / "Tele-Exit-Backend-Spec-v3.md",
    ]
    for spec in spec_candidates:
        if spec.is_file():
            paths.append(spec)
            break
    return paths


def chunk_markdown(text: str, *, source: str, max_chars: int = 1100) -> list[dict[str, str]]:
    """Split markdown into heading-aware chunks suitable for RAG."""
    parts = _HEADING_RE.split(text)
    chunks: list[dict[str, str]] = []

    # parts: [preamble, hlevel, title, body, hlevel, title, body, ...]
    if parts and parts[0].strip():
        chunks.extend(_split_body("Introduction", parts[0].strip(), source, max_chars))

    i = 1
    while i + 2 < len(parts):
        title = parts[i + 1].strip()
        body = parts[i + 2].strip()
        chunks.extend(_split_body(title, body, source, max_chars))
        i += 3

    if not chunks and text.strip():
        chunks.extend(_split_body(Path(source).stem, text.strip(), source, max_chars))
    return chunks


def _split_body(title: str, body: str, source: str, max_chars: int) -> list[dict[str, str]]:
    if not body:
        return [{"source": source, "title": title, "body": title}]
    if len(body) <= max_chars:
        return [{"source": source, "title": title, "body": body}]

    out: list[dict[str, str]] = []
    paragraphs = re.split(r"\n\s*\n", body)
    buf = ""
    part_n = 1
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if buf and len(buf) + len(para) + 2 > max_chars:
            out.append(
                {
                    "source": source,
                    "title": f"{title} ({part_n})",
                    "body": buf.strip(),
                }
            )
            part_n += 1
            buf = para
        else:
            buf = f"{buf}\n\n{para}".strip() if buf else para
    if buf.strip():
        out.append(
            {
                "source": source,
                "title": f"{title} ({part_n})" if part_n > 1 else title,
                "body": buf.strip(),
            }
        )
    return out


def _chunk_id(source: str, title: str, body: str) -> str:
    digest = hashlib.sha1(f"{source}|{title}|{body[:80]}".encode("utf-8")).hexdigest()[:16]
    return f"pk_{digest}"


def ingest_product_docs(
    store: ProductKnowledgeStore,
    paths: list[Path] | None = None,
    *,
    replace: bool = True,
) -> int:
    """Load markdown docs into the knowledge store. Returns chunk count."""
    paths = paths or default_doc_paths()
    if not paths:
        logger.warning("No product docs found to index")
        return 0

    if replace:
        store.clear()

    total = 0
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        source_label = path.name
        for chunk in chunk_markdown(text, source=source_label):
            cid = _chunk_id(chunk["source"], chunk["title"], chunk["body"])
            embed_text = f"{chunk['title']}\n{chunk['body']}"
            store.upsert_chunk(
                chunk_id=cid,
                source=chunk["source"],
                title=chunk["title"],
                body=chunk["body"],
                embedding=fast_embed(embed_text),
            )
            total += 1
        logger.info("Indexed %s (%s chars)", path.name, len(text))

    return total


async def ensure_product_knowledge(store: ProductKnowledgeStore) -> int:
    """Idempotent: reindex when empty so chat works after fresh DB."""
    if store.count() > 0:
        return store.count()
    return ingest_product_docs(store, replace=True)
