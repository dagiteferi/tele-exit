from __future__ import annotations

import logging

import httpx

from app.ports.web_search_port import WebSearchPort

logger = logging.getLogger(__name__)


class TavilySearchAdapter(WebSearchPort):
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("TAVILY_API_KEY is required")
        self.api_key = api_key

    async def search(self, query: str) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": self.api_key,
                        "query": query,
                        "max_results": 5,
                    },
                )
                if response.status_code >= 400:
                    logger.warning(
                        "Tavily search failed (%s) — returning no results",
                        response.status_code,
                    )
                    return []
                data = response.json()
        except Exception:
            logger.exception("Tavily search transport error")
            return []

        results = []
        for item in data.get("results", []):
            results.append(
                {
                    "title": item.get("title", ""),
                    "snippet": item.get("content", ""),
                    "url": item.get("url", ""),
                }
            )
        return results
