"""Storage use cases over a persistence adapter."""

import logging

from ...models import Doc
from .identity import LocalUser, UserPort
from .repository import StorageRepository, check_field

logger = logging.getLogger("argmap.capabilities.storage.service")


class StorageService:
    def __init__(self, repository: StorageRepository, identity: UserPort | None = None) -> None:
        self._repository = repository
        self._identity = identity or LocalUser()

    def current_id(self, header_value: str | None) -> str:
        logger.info("Starting current_id", extra={"event": "capability.function"})
        return self._identity.current_id(header_value)

    async def list_documents(
        self, user_id: str, collection: str, order_by: str | None, desc: bool, limit: int
    ) -> list[Doc]:
        logger.info("Starting list_documents", extra={"event": "capability.function"})
        check_field(order_by)
        return await self._repository.list(user_id, collection, order_by, desc, limit)

    async def put_document(self, user_id: str, collection: str, doc_id: str, data: Doc) -> None:
        logger.info("Starting put_document", extra={"event": "capability.function"})
        await self._repository.set(user_id, collection, doc_id, data)

    async def get_document(self, user_id: str, collection: str, doc_id: str) -> Doc | None:
        logger.info("Starting get_document", extra={"event": "capability.function"})
        return await self._repository.get(user_id, collection, doc_id)

    async def delete_document(self, user_id: str, collection: str, doc_id: str) -> bool:
        logger.info("Starting delete_document", extra={"event": "capability.function"})
        return await self._repository.delete(user_id, collection, doc_id)

    async def close(self) -> None:
        logger.info("Starting close", extra={"event": "capability.function"})
        await self._repository.close()
