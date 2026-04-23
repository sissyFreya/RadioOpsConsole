from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, WebSocket, status

from app.config import settings

AGENT_TOKEN_HEADER = "X-RadioOps-Agent-Token"


def _is_valid_token(token: str | None) -> bool:
    expected = settings.AGENT_SHARED_TOKEN
    if not expected:
        return True
    return secrets.compare_digest(token or "", expected)


def require_agent_token(x_radioops_agent_token: str | None = Header(default=None)) -> None:
    if not _is_valid_token(x_radioops_agent_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent token")


async def require_agent_ws(websocket: WebSocket) -> bool:
    token = websocket.headers.get(AGENT_TOKEN_HEADER)
    if not _is_valid_token(token):
        await websocket.close(code=4401)
        return False
    return True
