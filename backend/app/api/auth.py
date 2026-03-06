from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, TokenResponse, UserMe

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Avoid leaking which part is incorrect.
    now = datetime.now(timezone.utc)

    if not user or not user.is_active:
        db.add(AuditEvent(actor=payload.email, event="auth.login", result="error", details="user_not_found_or_inactive", ip_address=(request.client.host if request.client else None)))
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    locked_until = user.locked_until
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until and locked_until > now:
        db.add(AuditEvent(actor=user.email, event="auth.login", result="error", details="locked", ip_address=(request.client.host if request.client else None)))
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account temporarily locked")

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_count = int(user.failed_login_count or 0) + 1
        # Lockout policy: after 8 consecutive failures, lock for 5 minutes.
        if user.failed_login_count >= 8:
            user.locked_until = now + timedelta(minutes=5)
            details = "invalid_password_lockout"
        else:
            details = "invalid_password"
        db.add(AuditEvent(actor=user.email, event="auth.login", result="error", details=details, ip_address=(request.client.host if request.client else None)))
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Success — embed user_id in token so /me needs no DB round-trip
    user.failed_login_count = 0
    user.locked_until = None
    db.add(AuditEvent(actor=user.email, event="auth.login", result="ok", ip_address=(request.client.host if request.client else None)))
    db.commit()

    token = create_access_token(subject=user.email, role=user.role, user_id=user.id)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMe)
def me(user=Depends(get_current_user)):
    return UserMe(id=user.id, email=user.email, role=user.role)


@router.post("/refresh", response_model=TokenResponse)
def refresh(current_user=Depends(get_current_user)):
    """Issue a fresh token for the currently authenticated user."""
    token = create_access_token(subject=current_user.email, role=current_user.role, user_id=current_user.id)
    return TokenResponse(access_token=token)


@router.post("/change-password", status_code=200)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Authenticated users can change their own password by supplying the current one."""
    user = db.query(User).filter(User.email == current_user.email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if not verify_password(payload.current_password, user.password_hash):
        db.add(AuditEvent(actor=user.email, event="auth.change_password", result="error", details="wrong_current_password"))
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters")

    user.password_hash = hash_password(payload.new_password)
    user.failed_login_count = 0
    user.locked_until = None
    db.add(AuditEvent(actor=user.email, event="auth.change_password", result="ok"))
    db.commit()
    return {"ok": True}
