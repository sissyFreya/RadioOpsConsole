"""
RadioOps Agent — per-node FastAPI service.

Responsibilities:
  - Report service status (systemctl or mock)
  - Execute whitelisted actions (restart / reload)
  - Tail service logs via WebSocket (journalctl or mock)
  - Manage ffmpeg recordings  (→ recordings.py)
  - Browser mic → Icecast streaming (→ streaming.py)
  - Liquidsoap DJ takeover control (→ liquidsoap.py)
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.config import settings
from app.liquidsoap import router as liquidsoap_router
from app.recordings import router as recordings_router
from app.streaming import router as streaming_router

app = FastAPI(title="RadioOps Agent", version="0.2.0")

app.include_router(liquidsoap_router)
app.include_router(recordings_router)
app.include_router(streaming_router)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_cmd(cmd: list[str]) -> tuple[int, str]:
    import subprocess
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return p.returncode, p.stdout


def _mock_services() -> dict:
    def mk(name: str):
        return {
            "name": name,
            "active": True,
            "substate": "running",
            "since": datetime.utcnow().isoformat() + "Z",
        }

    return {
        "system": {
            "cpu_load": round(random.uniform(0.05, 1.90), 2),
            "mem_used_percent": round(random.uniform(20, 75), 1),
            "disk_used_percent": round(random.uniform(15, 80), 1),
        },
        "services": {s: mk(s) for s in settings.allowed_services},
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True, "mock": settings.MOCK_MODE}


@app.get("/status")
def status():
    if settings.MOCK_MODE:
        return _mock_services()

    services = {}
    for svc in settings.allowed_services:
        code, out = _run_cmd(["sh", "-lc", f"systemctl is-active {svc} || true"])
        active = out.strip() == "active"
        services[svc] = {
            "name": svc,
            "active": active,
            "substate": out.strip() or "unknown",
            "since": None,
        }

    return {"system": {}, "services": services}


class ActionRequest(BaseModel):
    service: str
    action: str  # restart | reload


@app.post("/actions")
def actions(payload: ActionRequest):
    if payload.service not in settings.allowed_services:
        raise HTTPException(status_code=400, detail=f"Service not allowed: {payload.service}")

    if payload.action not in {"restart", "reload"}:
        raise HTTPException(status_code=400, detail="Action not supported")

    if settings.MOCK_MODE:
        return {"ok": True, "output": f"[mock] {payload.action} {payload.service}: OK"}

    cmd = ["sh", "-lc", f"sudo systemctl {payload.action} {payload.service}"]
    code, out = _run_cmd(cmd)
    return {"ok": code == 0, "output": out}


@app.websocket("/logs/tail")
async def logs_tail(ws: WebSocket, service: str):
    await ws.accept()

    if service not in settings.allowed_services:
        await ws.send_text(f"[error] service not allowed: {service}")
        await ws.close()
        return

    try:
        if settings.MOCK_MODE:
            i = 0
            while True:
                i += 1
                ts = datetime.utcnow().isoformat() + "Z"
                level = random.choice(["INFO", "INFO", "INFO", "WARN", "ERROR"])
                msg = random.choice([
                    "Stream is healthy",
                    "Listeners updated",
                    "Source connected",
                    "Source disconnected",
                    "Reconnecting input...",
                    "Metadata refreshed",
                ])
                await ws.send_text(f"{ts} {level} {service}: {msg} (#{i})")
                await asyncio.sleep(0.5)
        else:
            proc = await asyncio.create_subprocess_exec(
                "sh", "-lc", f"journalctl -fu {service} -n 50 --no-pager",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    await asyncio.sleep(0.1)
                    continue
                await ws.send_text(line.decode(errors="replace").rstrip("\n"))

    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await ws.send_text(f"[error] {e}")
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass
