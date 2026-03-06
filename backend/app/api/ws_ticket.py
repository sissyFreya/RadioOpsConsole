"""
WebSocket ticket system.

Instead of passing the JWT token as a URL query param (which leaks into server
access logs and browser history), the frontend first requests a short-lived
one-time ticket via a normal authenticated HTTP call, then passes only the
opaque ticket in the WebSocket URL.

Flow:
  1. Frontend: POST /ws/ticket  (Authorization: Bearer <jwt>)
     → { "ticket": "<uuid>", "expires_in": 30 }
  2. Frontend: ws://host/ws/logs/tail?ticket=<uuid>&...
     → backend validates ticket (one-time, 30 s TTL), upgrades WS

Tickets are stored in-process (sufficient for a single-instance deployment).
For multi-instance setups, replace _tickets with a Redis backend.
"""
from __future__ import annotations

import time
import uuid
from typing import NamedTuple

from fastapi import APIRouter, Depends

from app.api.deps import TokenClaims, get_current_user

router = APIRouter(prefix="/ws", tags=["websocket"])

# ---- in-memory ticket store ----
_TICKET_TTL_SECONDS = 30


class _Ticket(NamedTuple):
    email: str
    expires_at: float


_tickets: dict[str, _Ticket] = {}


def issue_ticket(email: str) -> str:
    _purge_expired()
    key = uuid.uuid4().hex
    _tickets[key] = _Ticket(email=email, expires_at=time.monotonic() + _TICKET_TTL_SECONDS)
    return key


def consume_ticket(key: str) -> str | None:
    """Validate and consume a ticket. Returns the email or None if invalid/expired."""
    _purge_expired()
    ticket = _tickets.pop(key, None)
    if ticket is None:
        return None
    if time.monotonic() > ticket.expires_at:
        return None
    return ticket.email


def _purge_expired() -> None:
    now = time.monotonic()
    expired = [k for k, t in _tickets.items() if now > t.expires_at]
    for k in expired:
        _tickets.pop(k, None)


# ---- endpoint ----

@router.post("/ticket")
def create_ws_ticket(user: TokenClaims = Depends(get_current_user)) -> dict:
    """Issue a short-lived one-time ticket for WebSocket authentication."""
    ticket = issue_ticket(user.email)
    return {"ticket": ticket, "expires_in": _TICKET_TTL_SECONDS}
