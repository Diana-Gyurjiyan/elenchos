"""Reasoning use case: dispatch streamed model requests to configured providers."""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from ...core.config import Settings
from .anthropic import AnthropicProvider
from .base import Event, Provider, ReasoningRequest
from .ollama import OllamaProvider

logger = logging.getLogger("argmap.capabilities.reasoning.service")


class ReasoningService:
    def __init__(self, providers: list[Provider], default: str) -> None:
        self._providers = {provider.id: provider for provider in providers}
        self.default = default if default in self._providers else "ollama"

    async def stream(self, req: ReasoningRequest) -> AsyncIterator[Event]:
        provider = self._providers.get(req.provider or self.default)
        if provider is None:
            yield {"type": "error", "code": "unknown_provider"}
            return
        model = req.model or getattr(provider, "default_model", "default")
        started = time.perf_counter()
        logger.info(
            "Starting streaming (provider=%s, model=%s)",
            provider.id,
            model,
            extra={"event": "reasoning.stream.started"},
        )
        outcome = "incomplete"
        try:
            async for ev in provider.stream(req):
                if ev.get("type") == "error":
                    outcome = str(ev.get("code", "provider_error"))
                elif ev.get("type") == "done":
                    outcome = "success"
                yield ev
        except Exception as error:
            outcome = type(error).__name__
            raise
        finally:
            duration = time.perf_counter() - started
            if outcome == "success":
                logger.info(
                    "Streaming completed in %.1fs (provider=%s, model=%s)",
                    duration,
                    provider.id,
                    model,
                    extra={"event": "reasoning.stream.finished"},
                )
            else:
                logger.error(
                    "Streaming ended after %.1fs (provider=%s, model=%s, outcome=%s)",
                    duration,
                    provider.id,
                    model,
                    outcome,
                    extra={"event": "reasoning.stream.finished"},
                )

    async def describe(self) -> dict[str, Any]:
        logger.info("Starting provider discovery", extra={"event": "capability.function"})
        infos = await asyncio.gather(*(provider.info() for provider in self._providers.values()))
        return {"default": self.default, "providers": list(infos)}


def build_reasoning(settings: Settings) -> tuple[str, ReasoningService]:
    logger.info("Building reasoning providers", extra={"event": "capability.function"})
    providers: list[Provider] = [OllamaProvider(settings), AnthropicProvider(settings)]
    default = settings.default_provider if settings.default_provider in {p.id for p in providers} else "ollama"
    return "hub", ReasoningService(providers, default)
