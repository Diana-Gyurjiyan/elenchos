"""Ollama provider: a local LLM, no key needed. Default provider of the app."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from time import perf_counter
from typing import Any

import httpx

from ...core.config import Settings
from .base import Event, ReasoningRequest

logger = logging.getLogger("argmap.capabilities.reasoning.ollama")


class OllamaProvider:
    """
    Ollama provider: a local LLM, no key needed. Default provider of the app.
    """
    id = "ollama"
    label = "Ollama (lokaal)"
    needs_key = False

    @property
    def default_model(self) -> str:
        return self._s.ollama_model

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        progress_interval: float = 15,
    ) -> None:
        self._s = settings
        self._base = settings.ollama_base_url.rstrip("/")
        self._transport = transport
        self._progress_interval = progress_interval

    def _client(self, timeout: httpx.Timeout) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self._transport)

    async def stream(self, req: ReasoningRequest) -> AsyncIterator[Event]:
        """
        Stream reasoning results from Ollama so that we can show them to the user as they arrive. This is a generator that yields events.
        :param req: The reasoning request.
        :return: An async iterator over the events.
        """
        model = req.model or self._s.ollama_model
        started = perf_counter()
        first_token_at: float | None = None
        chunks = 0
        finished = asyncio.Event()

        logger.info(
            "Starting Ollama chat stream (model=%s)",
            model,
            extra={"event": "capability.function"},
        )
        logger.info(
            "Waiting for Ollama response and first token (model=%s)",
            model,
            extra={"event": "reasoning.stream.progress"},
        )

        async def report_progress() -> None:
            """
            Report progress while waiting for Ollama's first token. This function runs in a separate task and logs progress messages at regular intervals.
            :return: None
            """
            while True:
                try:
                    await asyncio.wait_for(finished.wait(), timeout=self._progress_interval)
                    return
                except TimeoutError:
                    elapsed = perf_counter() - started
                    if first_token_at is None:
                        message = "Still waiting for Ollama's first token"
                    else:
                        message = f"Ollama is generating ({chunks} chunks received)"
                    logger.info(
                        "%s (model=%s, elapsed=%.0fs)",
                        message,
                        model,
                        elapsed,
                        extra={"event": "reasoning.stream.progress"},
                    )

        progress_task = asyncio.create_task(report_progress())
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": req.prompt}],
            "stream": True,
            "options": {
                "num_ctx": self._s.ollama_num_ctx,
                "num_predict": self._s.sample_max_tokens,
            },
        }
        try:
            async with (
                self._client(httpx.Timeout(900, connect=5)) as client,
                client.stream("POST", f"{self._base}/api/chat", json=payload) as r,
            ):
                if r.status_code == 404:
                    yield {"type": "error", "code": "model_missing"}
                    return
                if r.status_code >= 400:
                    yield {"type": "error", "code": "generic"}
                    return
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    if obj.get("error"):
                        missing = "not found" in str(obj["error"]).lower()
                        yield {"type": "error", "code": "model_missing" if missing else "generic"}
                        return
                    chunk = (obj.get("message") or {}).get("content", "")
                    if chunk:
                        chunks += 1
                        if first_token_at is None:
                            first_token_at = perf_counter()
                            logger.info(
                                "First Ollama token received after %.1fs (model=%s)",
                                first_token_at - started,
                                model,
                                extra={"event": "reasoning.stream.progress"},
                            )
                        yield {"type": "text", "text": chunk}
                    if obj.get("done"):
                        yield {"type": "done", "truncated": obj.get("done_reason") == "length"}
                        return
            yield {"type": "error", "code": "generic"}  # stream ended without done
        except (httpx.ConnectError, httpx.ConnectTimeout):
            yield {"type": "error", "code": "ollama_down"}
        except (httpx.HTTPError, json.JSONDecodeError):
            yield {"type": "error", "code": "generic"}
        finally:
            finished.set()
            await progress_task

    async def info(self) -> dict[str, Any]:
        logger.info(
            "Checking Ollama availability and installed models",
            extra={"event": "capability.function"},
        )
        base = {
            "id": self.id,
            "label": self.label,
            "needs_key": False,
            "has_server_key": False,
            "default_model": self._s.ollama_model,
        }
        try:
            async with self._client(httpx.Timeout(3)) as client:
                r = await client.get(f"{self._base}/api/tags")
                r.raise_for_status()
                models = sorted(m["name"] for m in r.json().get("models", []))
        except (httpx.HTTPError, ValueError, KeyError):
            return {**base, "available": False, "models": []}
        return {**base, "available": True, "models": models}
