"""Small helpers shared by the routers."""

from typing import Annotated, Any

from fastapi import Header, HTTPException, Request

from .registry import Registry

UserHeader = Annotated[str | None, Header(alias="X-User-Id")]


def registry(request: Request) -> Registry:
    """
    Get the registry from the request's application state.
    :param request: The FastAPI Request object.
    :return:  The Registry instance stored in the application state.
    """
    return request.app.state.registry


def capability(request: Request, name: str) -> Any:
    """The capability, or 503 when it is not available (the frontend degrades on that).

    :param request: The FastAPI Request object.
    :param name: The name of the capability to retrieve.
    :return: The capability instance if available.
    """
    cap = registry(request).get(name)
    if cap is None:
        raise HTTPException(503, f"capability {name!r} is not available")
    return cap
