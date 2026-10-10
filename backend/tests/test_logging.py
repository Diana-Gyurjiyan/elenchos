import logging

from app.capabilities.observability.logging import EndpointCapabilityFilter


def test_only_api_endpoints_and_capabilities_are_logged_at_info_or_error() -> None:
    filter_ = EndpointCapabilityFilter()
    for level, event in (
        (logging.INFO, "http.request"),
        (logging.ERROR, "http.request"),
        (logging.INFO, "capability.function"),
    ):
        record = logging.LogRecord("argmap.http", level, __file__, 1, "GET /api/test", (), None)
        record.event = event
        assert filter_.filter(record)

    for name, level, event in (
        ("argmap.store", logging.INFO, "capability.operation"),
        ("argmap", logging.WARNING, "http.request"),
        ("argmap", logging.ERROR, "unexpected.error"),
        ("httpx", logging.INFO, "external.library_log"),
    ):
        suppressed = logging.LogRecord(name, level, __file__, 1, "noisy event", (), None)
        suppressed.event = event
        assert not filter_.filter(suppressed)
