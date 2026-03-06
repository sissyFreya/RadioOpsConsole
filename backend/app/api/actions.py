import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.action import Action
from app.models.audit import AuditEvent
from app.models.node import Node
from app.schemas.action import ActionCreate, ActionOut
from app.services.agent_client import run_action

router = APIRouter(prefix="/actions", tags=["actions"])


@router.get("/", response_model=list[ActionOut])
def list_actions(db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    return db.query(Action).order_by(Action.id.desc()).limit(200).all()


@router.post("/", response_model=ActionOut)
@limiter.limit("30/minute")
async def create_action(request: Request, payload: ActionCreate, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    node = db.query(Node).filter(Node.id == payload.node_id).first()
    if not node:
        raise HTTPException(status_code=400, detail="Invalid node_id")

    act = Action(requested_by=user.email, node_id=payload.node_id, service=payload.service, action=payload.action, status="running")
    db.add(act)
    db.add(AuditEvent(actor=user.email, event="action.request", target=f"node={payload.node_id} service={payload.service} action={payload.action}"))
    db.commit()
    db.refresh(act)

    try:
        result = await run_action(node.agent_url, payload.service, payload.action)
        act.status = "ok" if result.get("ok") else "error"
        act.output = result.get("output")
        db.add(AuditEvent(actor=user.email, event="action.result", target=str(act.id), result=act.status, details=act.output))
    except Exception as e:
        act.status = "error"
        act.output = str(e)
        db.add(AuditEvent(actor=user.email, event="action.error", target=str(act.id), result="error", details=str(e)))

    db.commit()
    db.refresh(act)
    return act


@router.post("/bulk", response_model=list[ActionOut])
async def bulk_actions(
    items: list[ActionCreate],
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    """Run multiple service actions in parallel across nodes."""
    if not items:
        return []
    if len(items) > 20:
        raise HTTPException(status_code=400, detail="Max 20 actions per bulk request")

    # Pre-validate all nodes
    node_ids = {item.node_id for item in items}
    nodes = {n.id: n for n in db.query(Node).filter(Node.id.in_(node_ids)).all()}
    for item in items:
        if item.node_id not in nodes:
            raise HTTPException(status_code=400, detail=f"Invalid node_id: {item.node_id}")

    # Create Action rows
    acts = []
    for item in items:
        act = Action(
            requested_by=user.email,
            node_id=item.node_id,
            service=item.service,
            action=item.action,
            status="running",
        )
        db.add(act)
        db.add(AuditEvent(
            actor=user.email,
            event="action.request",
            target=f"node={item.node_id} service={item.service} action={item.action}",
        ))
        acts.append(act)
    db.commit()
    for act in acts:
        db.refresh(act)

    async def _run(act: Action, node: Node) -> None:
        try:
            result = await run_action(node.agent_url, act.service, act.action)
            act.status = "ok" if result.get("ok") else "error"
            act.output = result.get("output")
        except Exception as e:
            act.status = "error"
            act.output = str(e)
        db.add(act)
        db.add(AuditEvent(
            actor=user.email,
            event="action.result",
            target=str(act.id),
            result=act.status,
            details=act.output,
        ))

    await asyncio.gather(*[_run(act, nodes[act.node_id]) for act in acts])
    db.commit()
    for act in acts:
        db.refresh(act)
    return acts
