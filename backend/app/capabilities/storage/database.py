"""PostgreSQL connection-pool adapter shared with persistence repositories."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool


class PostgresDatabase:
    def __init__(self, dsn: str) -> None:
        self._pool = AsyncConnectionPool(dsn, open=False, min_size=1, max_size=5)

    async def open(self) -> None:
        await self._pool.open(wait=True, timeout=5)

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[AsyncConnection]:
        async with self._pool.connection() as conn:
            yield conn

    async def close(self) -> None:
        await self._pool.close()
