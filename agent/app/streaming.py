"""
Browser microphone → Icecast live streaming via ffmpeg.

The browser sends WebM audio over a WebSocket; this module pipes it into
ffmpeg which transcodes to MP3 and pushes it to Icecast via the Liquidsoap
harbor ingest URL.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings

router = APIRouter()


def _build_icecast_url(mount: str | None = None, password: str | None = None) -> str:
    mount = mount or settings.LIVE_INGEST_MOUNT
    if not mount.startswith("/"):
        mount = "/" + mount
    password = password or settings.LIVE_INGEST_PASSWORD
    return f"icecast://source:{password}@{settings.LIVE_INGEST_HOST}:{settings.LIVE_INGEST_PORT}{mount}"


async def _discard_stream(reader: asyncio.StreamReader | None) -> None:
    if reader is None:
        return
    try:
        while True:
            chunk = await reader.read(4096)
            if not chunk:
                break
    except Exception:
        return


@router.websocket("/stream/browser")
async def stream_browser(ws: WebSocket):
    await ws.accept()

    fmt = ws.query_params.get("format") or "webm"
    mount = ws.query_params.get("mount")
    password = ws.query_params.get("password")
    ingest_url = _build_icecast_url(mount=mount, password=password)

    input_args = ["-f", "webm"] if fmt == "webm" else ["-f", fmt]
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        *input_args,
        "-i", "pipe:0",
        "-vn",
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-content_type", "audio/mpeg",
        "-f", "mp3",
        ingest_url,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
    except Exception as e:
        await ws.send_json({"type": "error", "message": f"ffmpeg start failed: {e}"})
        await ws.close()
        return

    asyncio.create_task(_discard_stream(proc.stderr))
    await ws.send_json({"type": "ready"})

    try:
        while True:
            data = await ws.receive_bytes()
            if proc.stdin is None:
                raise RuntimeError("ffmpeg stdin closed")
            proc.stdin.write(data)
            await proc.stdin.drain()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            if proc.stdin:
                proc.stdin.close()
        except Exception:
            pass
        try:
            await proc.wait()
        except Exception:
            pass
