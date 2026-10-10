"""Logic-check API backed by the deterministic Python logic engine."""

import logging
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from ...core.dependencies import capability

router = APIRouter(prefix="/logic", tags=["logic"])
logger = logging.getLogger("argmap.capabilities.routers.logic")


class LogicCheckIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    premises: list[str] = Field(default_factory=list, max_length=30)
    conclusion: str = Field(default="", max_length=10_000)
    mode: Literal["auto", "prop", "fol"] = "auto"
    max_size: int = Field(default=4, alias="maxSize", ge=2, le=6)


@router.post("/check")
async def check(body: LogicCheckIn, request: Request) -> dict[str, Any]:
    """Check whether the conclusion follows from the supplied premises.

    :param body: Premises, conclusion, and bounded-check options.
    :param request: The incoming API request.
    :returns: The logic engine result in the frontend-compatible format.
    """
    logger.info("Starting logic check endpoint", extra={"event": "capability.function"})
    check_argument = capability(request, "logic")
    return await run_in_threadpool(
        check_argument,
        body.premises,
        body.conclusion,
        {"mode": body.mode, "maxSize": body.max_size},
    )
