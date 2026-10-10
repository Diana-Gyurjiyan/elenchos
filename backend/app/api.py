"""Compose capability-owned API routers under the public ``/api`` prefix."""

from fastapi import APIRouter

from .capabilities.routers.capabilities import router as capabilities_router
from .capabilities.routers.identity import router as identity_router
from .capabilities.routers.logic import router as logic_router
from .capabilities.routers.reasoning import router as reasoning_router
from .capabilities.routers.storage import router as storage_router

api_router = APIRouter(prefix="/api")
for capability_router in (
    capabilities_router,
    reasoning_router,
    logic_router,
    storage_router,
    identity_router,
):
    api_router.include_router(capability_router)

__all__ = ["api_router"]
