from app.ports.web_search_port import WebSearchPort


class FakeSearch(WebSearchPort):
    def __init__(self, results: list[dict] | None = None) -> None:
        self._fixed_results = results
        self.calls: list[str] = []

    async def search(self, query: str) -> list[dict]:
        self.calls.append(query)
        if self._fixed_results is not None:
            return list(self._fixed_results)
        return [
            {
                "title": f"Overview of {query}",
                "snippet": f"A short summary about {query} for exam prep.",
                "url": f"https://example.com/search?q={query.replace(' ', '+')}",
            },
            {
                "title": f"{query} — practice notes",
                "snippet": f"Key points and examples related to {query}.",
                "url": f"https://example.com/notes/{query.replace(' ', '-').lower()}",
            },
        ]
