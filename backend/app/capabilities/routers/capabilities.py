"""HTTP endpoint for listing the capabilities available in this application."""

import logging
from typing import Any

from fastapi import APIRouter, Request

from ...core.dependencies import registry

router = APIRouter(tags=["capabilities"])
logger = logging.getLogger("argmap.capabilities.routers.capabilities")


@router.get("/capabilities")
async def capabilities(request: Request) -> dict[str, dict[str, Any]]:
    """Return the availability and adapters for each public capability.

    :param request: The incoming API request.
    :returns: Public capability metadata keyed by frontend capability name.
    """
    logger.info("Starting capabilities endpoint", extra={"event": "capability.function"})
    registered = registry(request).describe()
    return {
        "sample": registered["reasoning"],
        "store": registered["storage"],
        "user": registered["storage"],
        "logic": registered["logic"],
    }
