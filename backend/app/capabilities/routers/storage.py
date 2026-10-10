import json
import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from ...core.dependencies import UserHeader, capability
from ...models import Doc
from ..storage.service import StorageService

router = APIRouter(prefix="/store", tags=["storage"])
logger = logging.getLogger("argmap.capabilities.routers.storage")


@router.get("/{collection}")
async def list_docs(
    collection: str,
    request: Request,
    x_user_id: UserHeader = None,
    order_by: str | None = None,
    desc: bool = True,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
) -> list[Doc]:
    """List a user's documents in a collection.

    :param collection: Collection whose documents are requested.
    :param request: The incoming API request.
    :param x_user_id: Optional user identifier supplied in the request header.
    :param order_by: Optional numeric document field used for ordering.
    :param desc: Whether to sort in descending order.
    :param limit: Maximum number of documents to return.
    :returns: The matching documents.
    :raises fastapi.HTTPException: If the requested order field is invalid.
    """
    logger.info("Starting list_docs endpoint", extra={"event": "capability.function"})
    try:
        store: StorageService = capability(request, "storage")
        return await store.list_documents(
            store.current_id(x_user_id), collection, order_by, desc, limit
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.put("/{collection}/{doc_id}", status_code=204)
async def put_doc(
    collection: str,
    doc_id: str,
    data: Doc,
    request: Request,
    x_user_id: UserHeader = None,
) -> None:
    """Create or replace one document.

    :param collection: Collection that owns the document.
    :param doc_id: Document identifier.
    :param data: JSON document contents.
    :param request: The incoming API request.
    :param x_user_id: Optional user identifier supplied in the request header.
    :raises fastapi.HTTPException: If the document exceeds the size limit.
    """
    logger.info("Starting put_doc endpoint", extra={"event": "capability.function"})
    if len(json.dumps(data)) > 256_000:
        raise HTTPException(413, "document too large")
    store: StorageService = capability(request, "storage")
    await store.put_document(store.current_id(x_user_id), collection, doc_id, data)


@router.get("/{collection}/{doc_id}")
async def get_doc(
    collection: str, doc_id: str, request: Request, x_user_id: UserHeader = None
) -> Doc:
    """Retrieve one document by identifier.

    :param collection: Collection that owns the document.
    :param doc_id: Document identifier.
    :param request: The incoming API request.
    :param x_user_id: Optional user identifier supplied in the request header.
    :returns: The requested document.
    :raises fastapi.HTTPException: If the document does not exist.
    """
    logger.info("Starting get_doc endpoint", extra={"event": "capability.function"})
    store: StorageService = capability(request, "storage")
    doc = await store.get_document(store.current_id(x_user_id), collection, doc_id)
    if doc is None:
        raise HTTPException(404, "not found")
    return doc


@router.delete("/{collection}/{doc_id}", status_code=204)
async def delete_doc(
    collection: str, doc_id: str, request: Request, x_user_id: UserHeader = None
) -> None:
    """Delete a document if it exists.

    :param collection: Collection that owns the document.
    :param doc_id: Document identifier.
    :param request: The incoming API request.
    :param x_user_id: Optional user identifier supplied in the request header.
    """
    logger.info("Starting delete_doc endpoint", extra={"event": "capability.function"})
    store: StorageService = capability(request, "storage")
    await store.delete_document(store.current_id(x_user_id), collection, doc_id)
