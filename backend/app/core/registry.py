"""Capability registry.

A capability is a named domain service with a configured adapter. The registry wires reasoning,
storage, logic and observability into the application; HTTP routing is kept in
``capabilities/routers``.
A missing capability is reported as unavailable to its router.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Registry:
    _caps: dict[str, Any] = field(default_factory=dict)
    _adapters: dict[str, str] = field(default_factory=dict)

    def provide(self, name: str, adapter_name: str, impl: Any) -> None:
        self._caps[name] = impl
        self._adapters[name] = adapter_name

    def get(self, name: str) -> Any | None:
        return self._caps.get(name)

    def require(self, name: str) -> Any:
        impl = self._caps.get(name)
        if impl is None:
            raise KeyError(f"capability {name!r} is not available")
        return impl

    def describe(self) -> dict[str, dict[str, Any]]:
        known = ["reasoning", "storage", "logic", "observability"]
        return {n: {"available": n in self._caps, "adapter": self._adapters.get(n)} for n in known}
