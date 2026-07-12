from __future__ import annotations

import httpx

from app.ports.web_search_port import WebSearchPort


class TavilySearchAdapter(WebSearchPort):
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("TAVILY_API_KEY is required")
        self.api_key = api_key

    async def search(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "max_results": 5,
                },
            )
            response.raise_for_status()
            data = response.json()
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
