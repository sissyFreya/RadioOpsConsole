from __future__ import annotations

import asyncio
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.node import Node
from app.schemas.node import NodeCreate, NodeOut, NodeUpdate
from app.services.agent_client import fetch_status
from app.services.cache import cache_delete_prefix, cache_get, cache_set

router = APIRouter(prefix="/nodes", tags=["nodes"])

_STATUS_ALL_KEY = "nodes:status-all"
_STATUS_ALL_TTL = 8          # seconds — matches frontend staleTime
_NODE_STATUS_TTL = 8         # seconds per-node cache


@router.get("/", response_model=list[NodeOut])
def list_nodes(db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    return db.query(Node).order_by(Node.id.asc()).all()


@router.get("/status-all")
async def nodes_status_all(
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops", "viewer")),
):
    """
    Fetch status from ALL nodes in parallel (asyncio.gather).
    Results are cached in Redis for _STATUS_ALL_TTL seconds to reduce
    agent load when multiple dashboard clients poll simultaneously.
    """
    cached = await cache_get(_STATUS_ALL_KEY)
    if cached is not None:
        return cached

    nodes = db.query(Node).order_by(Node.id.asc()).all()

    async def _fetch_one(node: Node) -> dict:
        node_key = f"nodes:status:{node.id}"
        hit = await cache_get(node_key)
        if hit is not None:
            return hit
        try:
            status_data = await fetch_status(node.agent_url)
            result = {
                "node": {"id": node.id, "name": node.name, "agent_url": node.agent_url},
                "status": status_data,
                "error": None,
            }
        except (httpx.HTTPError, OSError) as e:
            result = {
                "node": {"id": node.id, "name": node.name, "agent_url": node.agent_url},
                "status": None,
                "error": str(e),
            }
        await cache_set(node_key, result, ttl=_NODE_STATUS_TTL)
        return result

    results = await asyncio.gather(*[_fetch_one(n) for n in nodes])
    payload = {"nodes": list(results)}
    await cache_set(_STATUS_ALL_KEY, payload, ttl=_STATUS_ALL_TTL)
    return payload


@router.post("/", response_model=NodeOut)
def create_node(payload: NodeCreate, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    node = Node(name=payload.name, agent_url=payload.agent_url)
    db.add(node)
    db.add(AuditEvent(actor=user.email, event="node.create", target=payload.name))
    db.commit()
    db.refresh(node)
    return node


@router.get("/{node_id}", response_model=NodeOut)
def get_node(node_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.patch("/{node_id}", response_model=NodeOut)
def update_node(
    node_id: int,
    payload: NodeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    changes: dict[str, dict[str, str]] = {}
    if payload.name is not None and payload.name != node.name:
        changes["name"] = {"from": node.name, "to": payload.name}
        node.name = payload.name
    if payload.agent_url is not None and payload.agent_url != node.agent_url:
        changes["agent_url"] = {"from": node.agent_url, "to": payload.agent_url}
        node.agent_url = payload.agent_url

    if changes:
        db.add(AuditEvent(actor=user.email, event="node.update", target=str(node_id), details=json.dumps(changes)))
        db.commit()
        db.refresh(node)

    return node


@router.put("/{node_id}", response_model=NodeOut)
def update_node_put(
    node_id: int,
    payload: NodeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    """PUT alias — kept for test/client compatibility."""
    return update_node(node_id, payload, db, user)


@router.delete("/{node_id}", status_code=204)
async def delete_node(node_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin"))):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    db.add(AuditEvent(actor=user.email, event="node.delete", target=str(node_id), details=node.name))
    db.delete(node)
    db.commit()
    # Evict cached status for this node and the aggregate
    await cache_delete_prefix(f"nodes:status:{node_id}")
    await cache_delete_prefix(_STATUS_ALL_KEY)


@router.get("/{node_id}/status")
async def node_status(node_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    node_key = f"nodes:status:{node_id}"
    cached = await cache_get(node_key)
    if cached is not None:
        return cached

    try:
        status_data = await fetch_status(node.agent_url)
    except (httpx.HTTPError, OSError) as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")

    result = {"node": {"id": node.id, "name": node.name, "agent_url": node.agent_url}, "status": status_data}
    await cache_set(node_key, result, ttl=_NODE_STATUS_TTL)
    return result
