"""
Business-level Prometheus metrics.

These complement the HTTP metrics from prometheus-fastapi-instrumentator with
domain-specific counters and gauges. Silently degrades to no-ops when
prometheus_client is not installed.
"""
from __future__ import annotations

try:
    from prometheus_client import Counter, Gauge

    action_total = Counter(
        "radioops_action_total",
        "Total service actions executed via the backend",
        ["status"],  # "ok" | "error"
    )

    podcast_upload_total = Counter(
        "radioops_podcast_upload_total",
        "Total podcast episode upload attempts",
        ["status"],  # "ok" | "rejected" | "error"
    )

    recordings_active = Gauge(
        "radioops_recordings_active",
        "Number of live recording sessions tracked in DB with status=running",
    )

except ImportError:
    class _Noop:
        def labels(self, **_kw): return self
        def inc(self, amount: float = 1) -> None: pass
        def set(self, value: float) -> None: pass
        def dec(self, amount: float = 1) -> None: pass

    action_total = _Noop()          # type: ignore[assignment]
    podcast_upload_total = _Noop()  # type: ignore[assignment]
    recordings_active = _Noop()     # type: ignore[assignment]
