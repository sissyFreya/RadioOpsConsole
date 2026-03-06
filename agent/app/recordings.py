"""
ffmpeg-based stream recording management.

Recordings are tracked in an in-process dict (RECORDINGS).
They are lost on agent restart — a known limitation for v0.x.
"""
from __future__ import annotations

import subprocess
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

# In-process recording registry: recording_id → subprocess.Popen
RECORDINGS: dict[str, subprocess.Popen] = {}


class RecordingStartRequest(BaseModel):
    recording_id: str | None = None
    url: str
    output_rel_path: str


class RecordingStopRequest(BaseModel):
    recording_id: str


def _safe_abs_path(rel_path: str) -> Path:
    root = Path(settings.DATA_ROOT).resolve()
    p = (root / rel_path).resolve()
    if root not in p.parents and p != root:
        raise HTTPException(status_code=400, detail="Invalid output path")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


@router.post("/recordings/start")
def recordings_start(payload: RecordingStartRequest):
    rid = payload.recording_id or uuid.uuid4().hex
    if rid in RECORDINGS:
        raise HTTPException(status_code=400, detail="Recording already exists")

    out_path = _safe_abs_path(payload.output_rel_path)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", payload.url,
        "-c", "copy",
        str(out_path),
    ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        RECORDINGS[rid] = proc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start recording: {e}")

    return {"ok": True, "recording_id": rid, "output_rel_path": payload.output_rel_path}


@router.post("/recordings/stop")
def recordings_stop(payload: RecordingStopRequest):
    proc = RECORDINGS.get(payload.recording_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Recording not found")

    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    finally:
        RECORDINGS.pop(payload.recording_id, None)

    return {"ok": True, "recording_id": payload.recording_id}
