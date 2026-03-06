from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.schemas.audit import AuditEventOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/", response_model=list[AuditEventOut])
def list_audit_events(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
    actor: str | None = Query(default=None),
    event: str | None = Query(default=None),
    result: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    q = db.query(AuditEvent)
    if actor:
        q = q.filter(AuditEvent.actor == actor)
    if event:
        q = q.filter(AuditEvent.event == event)
    if result:
        q = q.filter(AuditEvent.result == result)
    if since:
        q = q.filter(AuditEvent.created_at >= since)

    return q.order_by(AuditEvent.id.desc()).offset(offset).limit(limit).all()


@router.delete("/purge", response_model=dict)
def purge_audit_events(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin")),
    older_than_days: int = Query(default=90, ge=1, le=3650),
):
    """Delete audit events older than `older_than_days` days. Admin only."""
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    deleted = db.query(AuditEvent).filter(AuditEvent.created_at < cutoff).delete(synchronize_session=False)
    db.add(AuditEvent(actor=user.email, event="audit.purge", result="ok", details=f"deleted={deleted},days={older_than_days}"))
    db.commit()
    return {"deleted": deleted, "older_than_days": older_than_days}
