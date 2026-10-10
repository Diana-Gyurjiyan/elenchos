"""Structured application logging and HTTP request correlation."""

import logging
import sys
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_VISIBLE_EVENTS = {
    "http.request",
    "capability.registered",
    "capability.function",
    "reasoning.stream.started",
    "reasoning.stream.progress",
    "reasoning.stream.finished",
}


class EndpointCapabilityFilter(logging.Filter):
    """Keep only endpoint and capability INFO/ERROR events in terminal output."""

    def filter(self, record: logging.LogRecord) -> bool:
        return (
            record.levelno in {logging.INFO, logging.ERROR}
            and (record.name == "argmap" or record.name.startswith("argmap."))
            and getattr(record, "event", None) in _VISIBLE_EVENTS
        )


def configure_logging(level: str = "INFO") -> None:
    numeric_level = logging.getLevelName(level.upper())
    if not isinstance(numeric_level, int):
        raise ValueError(f"Invalid log level: {level}")  # noqa: TRY004
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    handler.addFilter(EndpointCapabilityFilter())
    handler._argmap_handler = True  # type: ignore[attr-defined]
    root = logging.getLogger()
    root.handlers[:] = [
        existing
        for existing in root.handlers
        if not getattr(existing, "_argmap_handler", False)
    ]
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    for name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(name)
        server_logger.handlers.clear()
        server_logger.propagate = True

    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False


http_logger = logging.getLogger("argmap.http")


class RequestLoggingMiddleware:
    """Log API endpoint requests once, as concise INFO events."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid4())
        status_code = 500
        response_completed = False

        async def send_with_logging(message: Message) -> None:
            nonlocal status_code, response_completed
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message["headers"] = headers
            elif message["type"] == "http.response.body" and not message.get("more_body", False):
                response_completed = True
            await send(message)
            if response_completed and scope.get("path", "").startswith("/api/"):
                route = scope.get("route")
                route_template = getattr(route, "path", None)
                if route_template is None or route_template in {"/{path:path}", "/api/{path:path}"}:
                    return
                if not route_template.startswith("/api/"):
                    route_template = f"/api{route_template}"
                level = logging.ERROR if status_code >= 500 else logging.INFO
                http_logger.log(
                    level,
                    "%s %s completed (%s)",
                    scope["method"],
                    route_template,
                    status_code,
                    extra={"event": "http.request"},
                )

        await self.app(scope, receive, send_with_logging)
