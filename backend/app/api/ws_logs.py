from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.node import Node
from app.models.user import User
from app.services.agent_client import ws_tail_logs
from app.api.ws_ticket import consume_ticket

router = APIRouter(tags=["logs"])


async def _resolve_user(db: Session, ticket: str) -> User | None:
    """Authenticate WebSocket caller via one-time opaque ticket (POST /ws/ticket)."""
    email = consume_ticket(ticket)
    if not email:
        return None
    return db.query(User).filter(User.email == email, User.is_active.is_(True)).first()


@router.websocket("/ws/logs/tail")
async def ws_logs_tail(
    websocket: WebSocket,
    node_id: int = Query(...),
    service: str = Query(...),
    ticket: str | None = Query(default=None),
):
    if not ticket:
        await websocket.close(code=4401)
        return

    db: Session = SessionLocal()
    try:
        user = await _resolve_user(db, ticket)
        if not user:
            await websocket.close(code=4401)
            return

        node = db.query(Node).filter(Node.id == node_id).first()
        if not node:
            await websocket.accept()
            await websocket.send_text("[error] node not found")
            await websocket.close()
            return

        await websocket.accept()
        async for line in ws_tail_logs(node.agent_url, service=service):
            await websocket.send_text(line)

    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await websocket.send_text(f"[error] {e}")
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        db.close()
