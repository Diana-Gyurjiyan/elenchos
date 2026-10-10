"""``user`` capability: who is asking. Local adapter = one fixed user, optionally overridden by
the ``X-User-Id`` header (handy for tests and for a future reverse proxy that does real auth)."""

from typing import Protocol


class UserPort(Protocol):
    def current_id(self, header_value: str | None) -> str: ...


class LocalUser:
    DEFAULT = "local"

    def current_id(self, header_value: str | None) -> str:
        v = (header_value or "").strip()
        return v[:64] if v else self.DEFAULT
