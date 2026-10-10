import asyncio
import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.capabilities.reasoning import ReasoningRequest, ReasoningService
from app.capabilities.reasoning.anthropic import AnthropicProvider
from app.capabilities.reasoning.base import Event
from app.capabilities.reasoning.ollama import OllamaProvider
from app.core.config import Settings
from app.main import create_app


def ndjson(*objs: dict[str, Any]) -> bytes:
    return ("\n".join(json.dumps(o) for o in objs) + "\n").encode()


async def collect(
    hub: ReasoningService,
    *,
    provider: str = "",
    model: str = "",
    api_key: str = "",
) -> list[Event]:
    request = ReasoningRequest("hi", provider, model, api_key)
    return [event async for event in hub.stream(request)]


def ollama(handler: Callable[[httpx.Request], httpx.Response]) -> OllamaProvider:
    return OllamaProvider(Settings(), transport=httpx.MockTransport(handler))


async def test_ollama_streams_and_reports_truncation() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["model"] == "llama3.1:8b"  # default model when none chosen
        assert body["options"]["num_ctx"] == 16384
        return httpx.Response(
            200,
            content=ndjson(
                {"message": {"content": "Hel"}, "done": False},
                {"message": {"content": "lo"}, "done": False},
                {"message": {"content": ""}, "done": True, "done_reason": "length"},
            ),
        )

    events = await collect(ReasoningService([ollama(handler)], "ollama"))
    assert "".join(e["text"] for e in events if e["type"] == "text") == "Hello"
    assert events[-1] == {"type": "done", "truncated": True}


async def test_ollama_logs_waiting_and_generation_progress_without_content(
    caplog: pytest.LogCaptureFixture,
) -> None:
    class SlowResponse(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            await asyncio.sleep(0.03)
            yield ndjson({"message": {"content": "private token"}, "done": False})
            await asyncio.sleep(0.03)
            yield ndjson({"message": {"content": ""}, "done": True})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=SlowResponse())

    caplog.set_level("INFO", logger="argmap.capabilities.reasoning.ollama")
    provider = OllamaProvider(
        Settings(),
        transport=httpx.MockTransport(handler),
        progress_interval=0.01,
    )
    events = [event async for event in provider.stream(ReasoningRequest("private prompt"))]

    messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == "argmap.capabilities.reasoning.ollama"
    ]
    assert events[-1] == {"type": "done", "truncated": False}
    assert any("Waiting for Ollama response and first token" in message for message in messages)
    assert any("Still waiting for Ollama's first token" in message for message in messages)
    assert any("First Ollama token received after" in message for message in messages)
    assert any("Ollama is generating" in message for message in messages)
    assert "private token" not in " ".join(messages)
    assert "private prompt" not in " ".join(messages)


async def test_sample_service_logs_stream_lifecycle_without_content(
    caplog: pytest.LogCaptureFixture,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=ndjson(
                {"message": {"content": "private response"}, "done": True},
            ),
        )

    caplog.set_level("INFO", logger="argmap.capabilities.reasoning.service")
    await collect(
        ReasoningService([ollama(handler)], "ollama"),
        model="qwen2.5:14b",
    )
    messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == "argmap.capabilities.reasoning.service"
    ]
    assert messages[0] == "Starting streaming (provider=ollama, model=qwen2.5:14b)"
    assert messages[1].startswith("Streaming completed in ")
    assert "private response" not in " ".join(messages)


async def test_ollama_uses_chosen_model_and_maps_errors() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["model"] = json.loads(request.content)["model"]
        return httpx.Response(404, content=b'{"error":"model not found"}')

    events = await collect(ReasoningService([ollama(handler)], "ollama"), model="qwen2.5:14b")
    assert seen["model"] == "qwen2.5:14b"
    assert events == [{"type": "error", "code": "model_missing"}]


async def test_ollama_down_is_reported() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    events = await collect(ReasoningService([ollama(handler)], "ollama"))
    assert events == [{"type": "error", "code": "ollama_down"}]
    info = await ollama(handler).info()
    assert info["available"] is False and info["models"] == []


async def test_ollama_lists_installed_models() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": "b:1"}, {"name": "a:2"}]})

    info = await ollama(handler).info()
    assert info["available"] and info["models"] == ["a:2", "b:1"]


async def test_service_rejects_non_ollama_provider() -> None:
    service = ReasoningService([ollama(lambda r: httpx.Response(500))], "ollama")
    assert await collect(service, provider="other") == [
        {"type": "error", "code": "unknown_provider"}
    ]


async def test_anthropic_requires_a_key_without_network_access() -> None:
    provider = AnthropicProvider(Settings(anthropic_api_key=""))
    service = ReasoningService([provider], "anthropic")
    assert await collect(service, provider="anthropic") == [{"type": "error", "code": "no_key"}]
    info = await provider.info()
    assert info["needs_key"] and not info["has_server_key"]


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    s = Settings(store_adapter="memory", frontend_dist="/nonexistent")
    app = create_app(s)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c


async def test_providers_endpoint_lists_ollama_and_anthropic(client: AsyncClient) -> None:
    body = (await client.get("/api/providers")).json()
    assert body["default"] == "ollama"
    assert [provider["id"] for provider in body["providers"]] == ["ollama", "anthropic"]


async def test_api_key_and_prompt_are_never_logged_or_echoed(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    private_prompt = "private prompt text"
    private_key = "sk-private-key"
    r = await client.post(
        "/api/sample",
        json={"prompt": private_prompt, "provider": "other", "api_key": private_key},
    )
    assert private_key not in r.text
    assert private_prompt not in r.text
    assert json.loads(r.text) == {"type": "error", "code": "unknown_provider"}
    output = capsys.readouterr().out
    assert private_key not in output
    assert private_prompt not in output
