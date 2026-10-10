import logging

from fastapi import APIRouter, Request

from ...core.dependencies import UserHeader, capability
from ..storage.service import StorageService

router = APIRouter(tags=["storage"])
logger = logging.getLogger("argmap.capabilities.routers.identity")


@router.get("/user")
async def user(request: Request, x_user_id: UserHeader = None) -> dict[str, str]:
    """Return the identifier resolved for the current user.

    :param request: The incoming API request.
    :param x_user_id: Optional user identifier supplied in the request header.
    :returns: The resolved user identifier.
    """
    logger.info("Starting user endpoint", extra={"event": "capability.function"})
    storage: StorageService = capability(request, "storage")
    return {"id": storage.current_id(x_user_id)}
