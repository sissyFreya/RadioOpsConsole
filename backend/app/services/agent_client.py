"""
Agent HTTP client.

Performance note (P2):
  A single shared httpx.AsyncClient is used for all agent calls instead of
  creating and tearing down a new client per request. This reuses TCP
  connections across requests (connection pooling) and avoids the TLS
  handshake overhead on every call.

  The client is initialised in the FastAPI lifespan (main.py) and stored at
  module level via setup_agent_client(). Teardown happens on app shutdown.
"""
from __future__ import annotations

from typing import Any

import httpx
import websockets

# Module-level client — set by setup_agent_client() at startup.
_client: httpx.AsyncClient | None = None


async def setup_agent_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
    )


async def teardown_agent_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _get_client() -> httpx.AsyncClient:
    if _client is not None:
        return _client
    raise RuntimeError(
        "Agent HTTP client not initialised. "
        "Call setup_agent_client() during application startup."
    )


# ---------------------------------------------------------------------------
# Agent API calls — all reuse the shared client
# ---------------------------------------------------------------------------

async def fetch_status(agent_url: str) -> dict[str, Any]:
    r = await _get_client().get(f"{agent_url}/status", timeout=10.0)
    r.raise_for_status()
    return r.json()


async def run_action(agent_url: str, service: str, action: str) -> dict[str, Any]:
    r = await _get_client().post(
        f"{agent_url}/actions",
        json={"service": service, "action": action},
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()


async def start_recording(agent_url: str, recording_id: str, url: str, output_rel_path: str) -> dict[str, Any]:
    r = await _get_client().post(
        f"{agent_url}/recordings/start",
        json={"recording_id": recording_id, "url": url, "output_rel_path": output_rel_path},
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()


async def stop_recording(agent_url: str, recording_id: str) -> dict[str, Any]:
    r = await _get_client().post(
        f"{agent_url}/recordings/stop",
        json={"recording_id": recording_id},
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()


async def takeover_status(agent_url: str) -> dict[str, Any]:
    r = await _get_client().get(f"{agent_url}/takeover/status", timeout=10.0)
    r.raise_for_status()
    return r.json()


async def takeover_enable(agent_url: str) -> dict[str, Any]:
    r = await _get_client().post(f"{agent_url}/takeover/enable", timeout=10.0)
    r.raise_for_status()
    return r.json()


async def takeover_disable(agent_url: str) -> dict[str, Any]:
    r = await _get_client().post(f"{agent_url}/takeover/disable", timeout=10.0)
    r.raise_for_status()
    return r.json()


async def fetch_icecast_stats(internal_base_url: str) -> dict[str, Any]:
    """Fetch Icecast JSON stats directly from the Icecast HTTP server."""
    clean = internal_base_url.rstrip("/")
    r = await _get_client().get(f"{clean}/status-json.xsl", timeout=5.0)
    r.raise_for_status()
    return r.json()


async def ws_tail_logs(agent_url: str, service: str):
    """Connect to agent WS and yield log lines."""
    ws_url = agent_url.replace("http://", "ws://").replace("https://", "wss://")
    uri = f"{ws_url}/logs/tail?service={service}"
    async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as ws:
        async for msg in ws:
            yield msg
