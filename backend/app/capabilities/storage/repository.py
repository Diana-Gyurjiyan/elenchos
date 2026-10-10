"""Storage adapters for per-user document collections.

Documents are JSON objects addressed by (user_id, collection, doc_id). ``list`` can order by one
top-level numeric field (e.g. ``"updated"``) and is capped by ``limit``.
"""

import json
import re
from typing import Any, Protocol

from ...models import Doc
from .database import PostgresDatabase

_FIELD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")


class StorageRepository(Protocol):
    async def set(self, user_id: str, collection: str, doc_id: str, data: Doc) -> None: ...
    async def get(self, user_id: str, collection: str, doc_id: str) -> Doc | None: ...
    async def delete(self, user_id: str, collection: str, doc_id: str) -> bool: ...
    async def list(
        self, user_id: str, collection: str, order_by: str | None, desc: bool, limit: int
    ) -> list[Doc]: ...
    async def close(self) -> None: ...


def check_field(name: str | None) -> str | None:
    if name is not None and not _FIELD.match(name):
        raise ValueError("invalid order_by field")
    return name


class MemoryStorageRepository:
    def __init__(self) -> None:
        self._d: dict[tuple[str, str, str], Doc] = {}

    async def set(self, user_id: str, collection: str, doc_id: str, data: Doc) -> None:
        self._d[(user_id, collection, doc_id)] = json.loads(json.dumps(data))

    async def get(self, user_id: str, collection: str, doc_id: str) -> Doc | None:
        return self._d.get((user_id, collection, doc_id))

    async def delete(self, user_id: str, collection: str, doc_id: str) -> bool:
        return self._d.pop((user_id, collection, doc_id), None) is not None

    async def list(
        self,
        user_id: str,
        collection: str,
        order_by: str | None,
        desc: bool,
        limit: int,
    ) -> list[Doc]:
        rows = [v for (u, c, _), v in self._d.items() if u == user_id and c == collection]
        if check_field(order_by):
            rows.sort(key=lambda r: r.get(order_by) or 0, reverse=desc)
        return rows[:limit]

    async def close(self) -> None:
        return None


class PostgresStorageRepository:
    SCHEMA = """
    CREATE TABLE IF NOT EXISTS documents (
      user_id    text NOT NULL,
      collection text NOT NULL,
      doc_id     text NOT NULL,
      data       jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, collection, doc_id)
    );
    """

    def __init__(self, dsn: str) -> None:
        self._database = PostgresDatabase(dsn)

    async def open(self) -> None:
        await self._database.open()
        async with self._database.connection() as conn:
            await conn.execute(self.SCHEMA)

    async def set(self, user_id: str, collection: str, doc_id: str, data: Doc) -> None:
        from psycopg.types.json import Jsonb

        async with self._database.connection() as conn:
            await conn.execute(
                """INSERT INTO documents (user_id, collection, doc_id, data)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (user_id, collection, doc_id)
                   DO UPDATE SET data = EXCLUDED.data, updated_at = now()""",
                (user_id, collection, doc_id, Jsonb(data)),
            )

    async def get(self, user_id: str, collection: str, doc_id: str) -> Doc | None:
        async with self._database.connection() as conn:
            cur = await conn.execute(
                "SELECT data FROM documents WHERE user_id=%s AND collection=%s AND doc_id=%s",
                (user_id, collection, doc_id),
            )
            row = await cur.fetchone()
        return row[0] if row else None

    async def delete(self, user_id: str, collection: str, doc_id: str) -> bool:
        async with self._database.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM documents WHERE user_id=%s AND collection=%s AND doc_id=%s",
                (user_id, collection, doc_id),
            )
            return cur.rowcount > 0

    async def list(
        self,
        user_id: str,
        collection: str,
        order_by: str | None,
        desc: bool,
        limit: int,
    ) -> list[Doc]:
        field = check_field(order_by)
        direction = "DESC" if desc else "ASC"
        order = (
            f"ORDER BY (data->>%s)::numeric {direction} NULLS LAST"
            if field
            else "ORDER BY updated_at DESC"
        )
        params: list[Any] = [user_id, collection]
        if field:
            params.append(field)
        params.append(limit)
        async with self._database.connection() as conn:
            cur = await conn.execute(
                f"SELECT data FROM documents WHERE user_id=%s AND collection=%s {order} LIMIT %s",
                params,
            )
            return [r[0] for r in await cur.fetchall()]

    async def close(self) -> None:
        await self._database.close()
