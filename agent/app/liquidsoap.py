"""
Liquidsoap telnet control + DJ takeover routes.

The Liquidsoap telnet port is internal to the Docker network.
Never expose it to the Internet.
"""
from __future__ import annotations

import socket

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Telnet helpers
# ---------------------------------------------------------------------------

def _recv_until(sock: socket.socket, markers: tuple[bytes, ...], max_bytes: int = 65536) -> bytes:
    sock.settimeout(3.0)
    buf = b""
    while not any(m in buf for m in markers) and len(buf) < max_bytes:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buf += chunk
    return buf


def _ls_telnet_cmd(cmd: str, timeout: float = 3.0) -> str:
    """Send a Liquidsoap telnet command and return raw output."""
    host = settings.LIQUIDSOAP_TELNET_HOST
    port = int(settings.LIQUIDSOAP_TELNET_PORT)

    cmd = (cmd or "").strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="cmd is required")

    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            try:
                _recv_until(s, markers=(b"> ", b"END"))
            except Exception:
                pass
            s.sendall((cmd + "\n").encode("utf-8"))
            data = _recv_until(s, markers=(b"> ", b"END"))
            return data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Liquidsoap telnet unreachable: {e}")


def _parse_status(raw: str) -> tuple[bool, bool]:
    r = (raw or "").lower()
    enabled = "enabled=true" in r
    connected = "connected=true" in r
    return enabled, connected


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TakeoverStatusOut(BaseModel):
    enabled: bool
    connected: bool
    raw: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/takeover/status", response_model=TakeoverStatusOut)
def takeover_status():
    raw = _ls_telnet_cmd("takeover.status")
    enabled, connected = _parse_status(raw)
    return {"enabled": enabled, "connected": connected, "raw": raw}


@router.post("/takeover/enable")
def takeover_enable():
    raw = _ls_telnet_cmd("takeover.enable")
    enabled, _ = _parse_status(raw)
    return {"ok": True, "enabled": enabled, "raw": raw}


@router.post("/takeover/disable")
def takeover_disable():
    raw = _ls_telnet_cmd("takeover.disable")
    enabled, _ = _parse_status(raw)
    return {"ok": True, "enabled": enabled, "raw": raw}
