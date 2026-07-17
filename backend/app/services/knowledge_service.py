import json
import re
from pathlib import Path

from pydantic import BaseModel, Field

from app.config import Settings

TOKEN_RE = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "our",
    "tell",
    "the",
    "to",
    "vjit",
    "what",
    "with",
    "you",
}


class KnowledgeItem(BaseModel):
    id: str
    title: str
    url: str
    keywords: list[str] = Field(default_factory=list)
    text: str


class KnowledgeService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._items = self._load(settings.knowledge_path)

    def retrieve(self, query: str, limit: int | None = None) -> list[KnowledgeItem]:
        query_terms = set(_tokens(query))
        if not query_terms:
            return []

        ranked: list[tuple[int, KnowledgeItem]] = []
        for item in self._items:
            haystack = set(_tokens(" ".join([item.title, " ".join(item.keywords), item.text])))
            keyword_hits = query_terms.intersection(_tokens(" ".join(item.keywords)))
            score = len(query_terms.intersection(haystack)) + (2 * len(keyword_hits))
            if score > 0:
                ranked.append((score, item))

        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in ranked[: limit or self._settings.knowledge_max_snippets]]

    def context_for(self, query: str) -> str:
        snippets = self.retrieve(query)
        if not snippets:
            return ""
        lines = [
            "Verified VJIT website facts. Use only when relevant; if a fact is not here, say you need the office or website to confirm it."
        ]
        lines.extend(f"- {item.title}: {item.text} Source: {item.url}" for item in snippets)
        return "\n".join(lines)

    @staticmethod
    def _load(path: Path) -> list[KnowledgeItem]:
        with path.open("r", encoding="utf-8") as file:
            raw_items = json.load(file)
        return [KnowledgeItem.model_validate(item) for item in raw_items]


def _tokens(text: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(text.lower()) if token not in STOP_WORDS and len(token) > 1]
