import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...core.dependencies import capability
from ..reasoning.base import ReasoningRequest

router = APIRouter(tags=["reasoning"])
logger = logging.getLogger("argmap.capabilities.routers.reasoning")


class ReasoningIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=120_000)
    provider: str = ""
    model: str = ""
    api_key: str = Field(default="", repr=False)


@router.get("/providers")
async def providers(request: Request) -> dict[str, Any]:
    """Return configured providers and their availability.

    :param request: The incoming API request.
    :returns: Provider metadata used by the model picker.
    """
    logger.info("Starting providers endpoint", extra={"event": "capability.function"})
    return await capability(request, "reasoning").describe()


@router.post("/sample")
async def sample(body: ReasoningIn, request: Request) -> StreamingResponse:
    """Stream reasoning output as newline-delimited JSON events.

    :param body: Prompt and provider-selection options.
    :param request: The incoming API request.
    :returns: A streaming NDJSON response.
    """
    logger.info("Starting sample endpoint", extra={"event": "capability.function"})
    reasoning = capability(request, "reasoning")
    req = ReasoningRequest(body.prompt, body.provider, body.model, body.api_key)

    async def lines() -> AsyncIterator[str]:
        logger.info(
            "Starting sample NDJSON response stream", extra={"event": "capability.function"}
        )
        async for ev in reasoning.stream(req):
            yield json.dumps(ev, ensure_ascii=False) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")
