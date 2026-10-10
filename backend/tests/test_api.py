import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    s = Settings(store_adapter="memory", frontend_dist="/nonexistent")
    app = create_app(s)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c


async def test_capabilities(client: AsyncClient, caplog: pytest.LogCaptureFixture) -> None:
    import logging

    caplog.set_level(logging.INFO)
    r = await client.get("/api/capabilities")
    caps = r.json()
    assert caps["sample"] == {"available": True, "adapter": "hub"}
    assert caps["store"]["adapter"] == "memory"
    assert caps["logic"] == {"available": True, "adapter": "python"}
    assert r.headers["x-request-id"]
    request_log = next(
        record for record in caplog.records if getattr(record, "event", None) == "http.request"
    )
    assert request_log.levelno == logging.INFO
    assert request_log.getMessage() == "GET /api/capabilities completed (200)"


async def test_sample_streams_ndjson(client: AsyncClient) -> None:
    r = await client.post("/api/sample", json={"prompt": "hi", "provider": "invalid"})
    events = [json.loads(line) for line in r.text.splitlines()]
    assert events == [{"type": "error", "code": "unknown_provider"}]


async def test_logic_check_runs_in_backend(client: AsyncClient) -> None:
    r = await client.post(
        "/api/logic/check",
        json={"premises": ["P → Q", "P"], "conclusion": "Q"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "valid"
    assert r.json()["logic"] == "prop"


async def test_logic_check_returns_parse_errors(client: AsyncClient) -> None:
    r = await client.post(
        "/api/logic/check",
        json={"premises": ["P ∧"], "conclusion": "Q"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert r.json()["errors"][0]["where"] == "premise"


async def test_logic_check_runs_finite_model_search(client: AsyncClient) -> None:
    r = await client.post(
        "/api/logic/check",
        json={
            "premises": ["∀x (Mens(x) → Sterfelijk(x))", "Mens(socrates)"],
            "conclusion": "Sterfelijk(socrates)",
            "maxSize": 3,
        },
    )
    assert r.status_code == 200
    assert r.json()["logic"] == "fol"
    assert r.json()["status"] == "valid_bounded"
    assert r.json()["maxSize"] == 3


async def test_logic_check_validates_domain_bound(client: AsyncClient) -> None:
    r = await client.post(
        "/api/logic/check",
        json={"premises": ["P"], "conclusion": "P", "maxSize": 99},
    )
    assert r.status_code == 422


async def test_store_roundtrip_and_isolation(client: AsyncClient) -> None:
    a = {"X-User-Id": "alice"}
    for i, upd in enumerate([10, 30, 20]):
        r = await client.put(
            f"/api/store/analyses/d{i}", json={"id": f"d{i}", "updated": upd}, headers=a
        )
        assert r.status_code == 204
    r = await client.get("/api/store/analyses?order_by=updated&desc=true", headers=a)
    assert [d["id"] for d in r.json()] == ["d1", "d2", "d0"]
    assert (await client.get("/api/store/analyses", headers={"X-User-Id": "bob"})).json() == []
    assert (await client.delete("/api/store/analyses/d1", headers=a)).status_code == 204
    assert (await client.get("/api/store/analyses/d1", headers=a)).status_code == 404


async def test_order_by_is_validated(client: AsyncClient) -> None:
    r = await client.get("/api/store/analyses?order_by=x;drop table")
    assert r.status_code == 422


async def test_app_refuses_to_start_without_postgres_when_storage_is_required(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from app.capabilities.storage.repository import PostgresStorageRepository

    async def unavailable(_self: PostgresStorageRepository) -> None:
        raise ConnectionError("database unavailable")

    monkeypatch.setattr(PostgresStorageRepository, "open", unavailable)
    app = create_app(Settings(store_adapter="postgres", frontend_dist=tmp_path / "missing"))

    with pytest.raises(RuntimeError, match=r"Start the Docker database with `make db-up`"):
        async with app.router.lifespan_context(app):
            pass
