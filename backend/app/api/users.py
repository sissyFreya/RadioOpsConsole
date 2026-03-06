from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user=Depends(require_role("admin"))):
    return db.query(User).order_by(User.id.asc()).limit(500).all()


@router.post("/", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db), actor=Depends(require_role("admin"))):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already exists")

    u = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(u)
    db.add(AuditEvent(actor=actor.email, event="user.create", target=payload.email))
    db.commit()
    db.refresh(u)
    return u


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), actor=Depends(require_role("admin"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.role is not None:
        u.role = payload.role
    if payload.is_active is not None:
        u.is_active = payload.is_active
    if payload.password is not None:
        u.password_hash = hash_password(payload.password)
        u.failed_login_count = 0
        u.locked_until = None

    db.add(AuditEvent(actor=actor.email, event="user.update", target=str(u.id)))
    db.commit()
    db.refresh(u)
    return u