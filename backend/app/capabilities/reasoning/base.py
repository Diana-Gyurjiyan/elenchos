"""Shared types of the reasoning capability's model-streaming use case.

Event contract (an async iterator of dicts):
  {"type": "text", "text": "..."}        repeated
  {"type": "done", "truncated": bool}    once, last
  {"type": "error", "code": str}         instead of done
Error codes: no_key, auth, rate_limited, refused, ollama_down, model_missing,
unknown_provider, generic. The frontend maps them to i18n messages.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

Event = dict[str, Any]


@dataclass(frozen=True)
class ReasoningRequest:
    prompt: str
    provider: str = "ollama"
    model: str = ""
    api_key: str = ""  # per request, never stored or logged


class Provider(Protocol):
    id: str

    def stream(self, req: ReasoningRequest) -> AsyncIterator[Event]: ...

    async def info(self) -> dict[str, Any]: ...
