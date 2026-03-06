"""
Authentication and authorization dependencies.

Performance note (P1):
  get_current_user decodes the JWT and returns a lightweight TokenClaims
  dataclass — no database round-trip on every authenticated request.

  The JWT already carries: sub (email), role, uid (user id).
  This is valid because:
    - Tokens expire after JWT_ACCESS_MINUTES (default 60 min).
    - For a radio ops console the 60-min window before a deactivated user
      loses access is acceptable. Reduce JWT_ACCESS_MINUTES for stricter
      requirements, or add a Redis token blocklist.

  For operations that genuinely need the database User row (e.g. password
  change, user management), use get_db_user() instead.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


@dataclass
class TokenClaims:
    """Lightweight user identity derived from the JWT — no DB query needed."""
    id: int
    email: str
    role: str


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> TokenClaims:
    """Decode the JWT and return claims. No database query."""
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(creds.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    email = payload.get("sub")
    role = payload.get("role")
    uid = payload.get("uid", 0)

    if not email or not role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return TokenClaims(id=uid, email=email, role=role)


def require_role(*roles: str):
    def _checker(user: TokenClaims = Depends(get_current_user)) -> TokenClaims:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _checker


def get_db_user(
    claims: TokenClaims = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """
    Full DB lookup — use only when you truly need the ORM User object
    (e.g. password verification, checking is_active for sensitive actions).
    """
    user = db.query(User).filter(User.email == claims.email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    return user
