import re
from urllib.parse import urlparse

from pydantic import BaseModel

from app.core.config import settings

FAKE_HOST = "fixtures.example"


class SearchResult(BaseModel):
    url: str
    title: str
    content: str  # the provider's snippet


def domain_of(url: str) -> str:
    return (urlparse(url).hostname or "").removeprefix("www.")


def _slug(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")[:40] or "query"


def fake_results(query: str, max_results: int) -> list[SearchResult]:
    slug = _slug(query)
    return [
        SearchResult(
            url=f"https://{FAKE_HOST}/{slug}/{n}",
            title=f"Fixture article {n} about {slug}",
            content=f"Fixture snippet {n} for {query}.",
        )
        for n in range(1, max_results + 1)
    ]


async def search_web(query: str, max_results: int = 3) -> list[SearchResult]:
    if settings.search_provider == "fake":
        return fake_results(query, max_results)

    from langchain_tavily import TavilySearch

    tool = TavilySearch(
        max_results=max_results,
        topic="general",
        tavily_api_key=settings.tavily_api_key,
    )
    raw = await tool.ainvoke({"query": query})
    items = raw.get("results", []) if isinstance(raw, dict) else []
    return [
        SearchResult(url=i["url"], title=i.get("title") or i["url"], content=i.get("content", ""))
        for i in items
        if i.get("url")
    ]
