"""
Liquidsoap telnet control + DJ takeover + playlist management routes.

The Liquidsoap telnet port is internal to the Docker network.
Never expose it to the Internet.
"""
from __future__ import annotations

import os
import socket
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
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


class TrackOut(BaseModel):
    filename: str
    path: str
    size: int
    display_name: str


# ---------------------------------------------------------------------------
# Audio file helpers
# ---------------------------------------------------------------------------

AUDIO_EXTENSIONS = {".mp3", ".flac", ".ogg", ".aac", ".wav", ".m4a", ".opus"}


def _clean_name(filename: str) -> str:
    """Strip extension and clean up filename for display."""
    stem = Path(filename).stem
    return stem.replace("_", " ").replace("-", " ").strip()


def _list_tracks(radio_id: str) -> list[TrackOut]:
    data_root = Path(settings.DATA_ROOT)
    tracks_dir = data_root / f"radios/radio_{radio_id}/tracks"

    if not tracks_dir.exists():
        return []

    tracks = []
    for f in sorted(tracks_dir.iterdir()):
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS:
            tracks.append(TrackOut(
                filename=f.name,
                path=str(f),
                size=f.stat().st_size,
                display_name=_clean_name(f.name),
            ))
    return tracks


# ---------------------------------------------------------------------------
# DJ Takeover routes
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


# ---------------------------------------------------------------------------
# Playlist / AutoDJ control routes
# ---------------------------------------------------------------------------

@router.get("/tracks")
def list_tracks(radio_id: str = Query("1", description="Radio ID")):
    """List audio tracks available in the radio's library."""
    tracks = _list_tracks(radio_id)
    return {"tracks": [t.model_dump() for t in tracks], "count": len(tracks)}


@router.post("/autodj/skip")
def autodj_skip():
    """Skip the current AutoDJ track (plays the next one immediately)."""
    # Liquidsoap telnet is always available regardless of MOCK_MODE
    # (MOCK_MODE only gates systemctl commands, not Liquidsoap control)
    raw = _ls_telnet_cmd("playlist.skip")
    return {"ok": True, "raw": raw.strip()}


@router.post("/autodj/queue")
def autodj_queue(uri: str = Query(..., description="Absolute path to the audio file")):
    """
    Push a specific track into the jukebox queue.
    The track will play before the next autodj track.
    """
    if not uri:
        raise HTTPException(status_code=400, detail="uri is required")

    # Security: only allow files inside DATA_ROOT
    data_root = Path(settings.DATA_ROOT).resolve()
    try:
        target = Path(uri).resolve()
        target.relative_to(data_root)
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="Path not allowed")

    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if target.suffix.lower() not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not a supported audio file")

    raw = _ls_telnet_cmd(f"playlist.push {uri}")
    return {"ok": True, "raw": raw.strip()}


@router.get("/autodj/queue")
def get_queue():
    """Get the current jukebox queue (upcoming requested tracks)."""
    raw = _ls_telnet_cmd("jukebox.queue")
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.startswith(">")]
    return {"queue": lines, "raw": raw.strip()}
