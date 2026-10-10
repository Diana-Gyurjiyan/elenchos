import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import api_router
from .capabilities.logic.service import check_argument
from .capabilities.observability import RequestLoggingMiddleware, configure_logging
from .capabilities.reasoning import build_reasoning
from .capabilities.storage import (
    LocalUser,
    MemoryStorageRepository,
    PostgresStorageRepository,
    StorageService,
)
from .core.config import Settings, get_settings
from .core.registry import Registry


def build_registry(settings: Settings) -> Registry:
    """
    Build a registry of capabilities based on the provided settings.

    :param settings: A Settings object containing configuration for the application.
    :returns: A registry populated with the configured capabilities.
    """
    reg = Registry()
    reg.provide("reasoning", *build_reasoning(settings))
    reg.provide("logic", "python", check_argument)
    reg.provide("observability", "python-logging", logging.getLogger("argmap"))
    return reg


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    Create a FastAPI application with the given settings.

    :param settings: Application settings, or ``None`` to load the defaults.
    :returns: A configured FastAPI application instance.
    """
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        reg = build_registry(settings)
        storage: StorageService | None = None
        if settings.store_adapter == "memory":
            storage = StorageService(MemoryStorageRepository(), LocalUser())
            reg.provide("storage", "memory", storage)
        else:
            try:
                repository = PostgresStorageRepository(settings.database_url)
                await repository.open()
                storage = StorageService(repository, LocalUser())
                reg.provide("storage", "postgres", storage)
            except Exception as exc:
                logging.getLogger("argmap.capabilities.storage").exception(
                    "PostgreSQL is unavailable; refusing to start without persistent storage"
                )
                raise RuntimeError(
                    "PostgreSQL storage is required. Start the Docker database with `make db-up`."
                ) from exc
        app.state.registry = reg
        for name, capability in reg.describe().items():
            logging.getLogger("argmap.capabilities").info(
                "Capability %s: %s%s",
                name,
                "available" if capability["available"] else "unavailable",
                f" (adapter={capability['adapter']})" if capability["adapter"] else "",
                extra={"event": "capability.registered"},
            )
        yield
        if storage:
            await storage.close()

    app = FastAPI(title="Elenchos", lifespan=lifespan)
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(api_router)

    dist = settings.frontend_dist
    if dist.is_dir():  # production (`make app`): backend also serves the built frontend
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str) -> FileResponse:
            f = dist / path
            return FileResponse(f if path and f.is_file() else dist / "index.html")

    return app


app = create_app()
