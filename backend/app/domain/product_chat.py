"""General product / website chatbot grounded in docs + optional web search."""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from app.adapters.real.product_knowledge_adapter import ProductKnowledgeStore
from app.ports.llm_port import LLMPort
from app.ports.web_search_port import WebSearchPort

logger = logging.getLogger(__name__)

PRODUCT_CHAT_SYSTEM = """You are the Tele-Exit home-page assistant.
Answer ONLY from the Knowledge context. Be clear and concise (2–4 short sentences).
Prefer website / FAQ knowledge for product how-to; use backend-spec knowledge for APIs/auth/architecture.
If unsure, say so and suggest hello@tele-exit.et. No exam answers or account changes.
"""

_FAKE_MARKERS = (
    "fake tutor response",
    "for local development",
)

_WEB_HINT = re.compile(
    r"\b(web|internet|online|google|search the web|from the web)\b",
    re.I,
)


async def answer_product_question(
    *,
    message: str,
    llm: LLMPort,
    knowledge: ProductKnowledgeStore,
    search: WebSearchPort | None = None,
    use_web: bool | None = None,
) -> dict[str, Any]:
    text = (message or "").strip()
    if not text:
        return {
            "reply": "Ask me anything about Tele-Exit — signup, practice calls, readiness, or how the product works.",
            "sources": [],
            "agent_used": "product",
        }

    matches, web_results, prompt, agent = await _prepare(
        text, knowledge=knowledge, search=search, use_web=use_web
    )

    reply = ""
    try:
        reply = (await llm.generate(prompt, system=PRODUCT_CHAT_SYSTEM) or "").strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Product chat LLM failed: %s", exc)
        reply = ""

    if not reply or _looks_like_placeholder(reply):
        reply = _extractive_reply(text, matches, web_results)

    return {
        "reply": reply,
        "sources": _sources_from(matches, web_results),
        "agent_used": agent,
    }


async def stream_product_answer(
    *,
    message: str,
    llm: LLMPort,
    knowledge: ProductKnowledgeStore,
    search: WebSearchPort | None = None,
    use_web: bool | None = False,
) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE-friendly events: meta → token* → done | error."""
    text = (message or "").strip()
    if not text:
        yield {"type": "token", "text": "Ask me about Tele-Exit — signup, practice calls, or readiness."}
        yield {"type": "done", "sources": [], "agent_used": "product"}
        return

    matches, web_results, prompt, agent = await _prepare(
        text, knowledge=knowledge, search=search, use_web=use_web, top_k=3
    )
    sources = _sources_from(matches, web_results)
    yield {"type": "meta", "agent_used": agent, "sources": sources}

    best = float(matches[0]["score"]) if matches else 0.0
    stream_fn = getattr(llm, "stream_generate", None)
    produced = ""

    # Very strong FAQ hit → stream extractive answer immediately.
    if best >= 1.15:
        produced = _extractive_reply(text, matches, web_results)
        async for piece in _chunk_text(produced):
            yield {"type": "token", "text": piece}
        yield {"type": "done", "sources": sources, "agent_used": agent, "reply": produced}
        return

    try:
        if callable(stream_fn):
            async for delta in stream_fn(prompt, system=PRODUCT_CHAT_SYSTEM):
                if not delta:
                    continue
                produced += delta
                yield {"type": "token", "text": delta}
        else:
            produced = (await llm.generate(prompt, system=PRODUCT_CHAT_SYSTEM) or "").strip()
            if produced and not _looks_like_placeholder(produced):
                async for piece in _chunk_text(produced):
                    yield {"type": "token", "text": piece}
            else:
                produced = ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("Product chat stream failed: %s", exc)
        produced = ""

    if not produced or _looks_like_placeholder(produced):
        fallback = _extractive_reply(text, matches, web_results)
        async for piece in _chunk_text(fallback):
            yield {"type": "token", "text": piece}
        produced = fallback

    yield {"type": "done", "sources": sources, "agent_used": agent, "reply": produced}


async def _prepare(
    text: str,
    *,
    knowledge: ProductKnowledgeStore,
    search: WebSearchPort | None,
    use_web: bool | None,
    top_k: int = 5,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str]:
    matches = knowledge.query(text, top_k=top_k)
    best = float(matches[0]["score"]) if matches else 0.0
    # Home chat defaults to docs-only for speed unless user opts into web.
    if use_web is True:
        want_web = True
    elif use_web is False:
        want_web = False
    else:
        want_web = _WEB_HINT.search(text) is not None and best < 0.35

    web_results: list[dict[str, Any]] = []
    if want_web and search is not None:
        try:
            query = text if _WEB_HINT.search(text) else f"Tele-Exit exit exam practice {text}"
            web_results = await search.search(query)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Product chat web search failed: %s", exc)
            web_results = []

    context = _format_context(matches, web_results)
    prompt = (
        f"User question:\n{text}\n\n"
        f"Knowledge:\n{context}\n\n"
        "Write a helpful answer for the user."
    )
    agent = "product_web" if web_results else "product"
    return matches, web_results, prompt, agent


async def _chunk_text(text: str, size: int = 12) -> AsyncIterator[str]:
    """Simulate token streaming for non-streaming LLM / extractive replies."""
    if not text:
        return
    i = 0
    while i < len(text):
        end = min(len(text), i + size)
        # Prefer breaking on spaces for smoother typing.
        if end < len(text):
            space = text.rfind(" ", i, end + 8)
            if space > i:
                end = space + 1
        yield text[i:end]
        i = end
        await asyncio.sleep(0.012)


def _format_context(matches: list[dict[str, Any]], web_results: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for m in matches[:4]:
        blocks.append(
            f"[doc:{m.get('source', 'doc')} — {m.get('title', '')}]\n{m.get('body', '')[:700]}"
        )
    for item in web_results[:3]:
        title = item.get("title", "Web result")
        snippet = item.get("snippet") or item.get("content") or ""
        url = item.get("url", "")
        blocks.append(f"[web — {title}]\n{snippet[:400]}\n{url}")
    return "\n\n".join(blocks) if blocks else "(No matching knowledge found.)"


def _looks_like_placeholder(reply: str) -> bool:
    lowered = reply.lower()
    return any(marker in lowered for marker in _FAKE_MARKERS)


def _extractive_reply(
    question: str,
    matches: list[dict[str, Any]],
    web_results: list[dict[str, Any]],
) -> str:
    if matches and float(matches[0].get("score") or 0) >= 0.12:
        top = matches[0]
        body = str(top.get("body") or "").strip()
        snippet = _first_sentences(body, max_chars=360)
        title = top.get("title") or "Tele-Exit"
        return f"From our docs ({title}): {snippet}"

    if web_results:
        first = web_results[0]
        snip = (first.get("snippet") or first.get("content") or "").strip()
        title = first.get("title") or "the web"
        if snip:
            return f"From {title}: {_first_sentences(snip, max_chars=320)}"

    q = question.lower()
    if any(w in q for w in ("contact", "email", "phone", "support")):
        return "You can reach Tele-Exit at hello@tele-exit.et or +251 911 000 000 (Addis Ababa)."
    if any(w in q for w in ("register", "sign up", "account")):
        return "Create an account from Register: set your name, email, field of study, and exam date so practice aims at your timeline."
    if any(w in q for w in ("call", "practice", "coach")):
        return "A study call is a live one-on-one session with the AI coach using previous-year exit exam questions. Open an exam in practice mode, then start a call when you want coaching out loud."

    return (
        "I couldn't find a precise match in Tele-Exit docs for that. "
        "Try asking about signup, practice calls, readiness, Settings (AI voice), or contact — "
        "or email hello@tele-exit.et."
    )


def _first_sentences(text: str, max_chars: int = 400) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    cut = cleaned[:max_chars]
    for sep in (". ", "! ", "? "):
        idx = cut.rfind(sep)
        if idx > max_chars // 2:
            return cut[: idx + 1].strip()
    return cut.rsplit(" ", 1)[0].strip() + "…"


def _sources_from(
    matches: list[dict[str, Any]],
    web_results: list[dict[str, Any]],
) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for m in matches[:3]:
        sources.append(
            {
                "title": str(m.get("title") or "Doc"),
                "source": str(m.get("source") or "docs"),
            }
        )
    for item in web_results[:3]:
        sources.append(
            {
                "title": str(item.get("title") or "Web"),
                "source": str(item.get("url") or "web"),
            }
        )
    return sources
