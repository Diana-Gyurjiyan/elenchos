"""Anthropic provider: API key can be supplied per request or by the server."""

import logging
from collections.abc import AsyncIterator
from typing import Any

from ...core.config import Settings
from .base import Event, ReasoningRequest

logger = logging.getLogger("argmap.capabilities.reasoning.anthropic")


class AnthropicProvider:
    id = "anthropic"
    label = "Anthropic (API)"
    needs_key = True

    @property
    def default_model(self) -> str:
        return self._settings.model_default

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def stream(self, req: ReasoningRequest) -> AsyncIterator[Event]:
        model = req.model or self._settings.model_default
        logger.info(
            "Starting Anthropic message stream (model=%s)",
            model,
            extra={"event": "capability.function"},
        )
        import anthropic

        key = req.api_key or self._settings.anthropic_api_key
        if not key:
            yield {"type": "error", "code": "no_key"}
            return

        client = anthropic.AsyncAnthropic(api_key=key)
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=self._settings.sample_max_tokens,
                messages=[{"role": "user", "content": req.prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yield {"type": "text", "text": text}
                final = await stream.get_final_message()
            if final.stop_reason == "refusal":
                yield {"type": "error", "code": "refused"}
                return
            yield {"type": "done", "truncated": final.stop_reason == "max_tokens"}
        except anthropic.AuthenticationError:
            yield {"type": "error", "code": "auth"}
        except anthropic.RateLimitError:
            yield {"type": "error", "code": "rate_limited"}
        except anthropic.NotFoundError:
            yield {"type": "error", "code": "model_missing"}
        except anthropic.APIError:
            yield {"type": "error", "code": "generic"}

    async def info(self) -> dict[str, Any]:
        logger.info(
            "Reporting Anthropic provider configuration",
            extra={"event": "capability.function"},
        )
        return {
            "id": self.id,
            "label": self.label,
            "needs_key": True,
            "has_server_key": bool(self._settings.anthropic_api_key),
            "available": True,
            "default_model": self._settings.model_default,
            "models": self._settings.anthropic_models,
        }
