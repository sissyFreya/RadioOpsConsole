from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.live import LiveSession
from app.models.node import Node
from app.models.podcast import PodcastEpisode, PodcastShow
from app.models.radio import Radio
from app.schemas.live import LiveSessionOut, LiveStartRequest, LiveStopRequest
from app.services.agent_client import start_recording, stop_recording

router = APIRouter(prefix="/live", tags=["live"])


def _mount_list(radio: Radio) -> list[str]:
    return [m.strip() for m in (radio.mounts or "").split(",") if m.strip()]


@router.get("/active", response_model=LiveSessionOut | None)
def get_active(radio_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    sess = (
        db.query(LiveSession)
        .filter(LiveSession.radio_id == radio_id)
        .filter(LiveSession.status == "running")
        .order_by(LiveSession.id.desc())
        .first()
    )
    return sess


@router.post("/start", response_model=LiveSessionOut)
async def start(payload: LiveStartRequest, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    radio = db.query(Radio).filter(Radio.id == payload.radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    show = db.query(PodcastShow).filter(PodcastShow.id == payload.show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    existing = (
        db.query(LiveSession)
        .filter(LiveSession.radio_id == payload.radio_id)
        .filter(LiveSession.status == "running")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Live session already running for this radio")

    mounts = _mount_list(radio)
    mount = payload.mount.strip()
    if not mount.startswith("/"):
        mount = "/" + mount
    if mounts and mount not in mounts:
        raise HTTPException(status_code=400, detail=f"Mount not allowed for this radio. Allowed: {mounts}")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    recording_id = uuid.uuid4().hex
    output_rel_path = f"podcasts/show_{payload.show_id}/live_{recording_id}.mp3"
    stream_url = f"{radio.internal_base_url.rstrip('/')}{mount}"

    try:
        await start_recording(node.agent_url, recording_id=recording_id, url=stream_url, output_rel_path=output_rel_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to start recording: {e}")

    sess = LiveSession(
        radio_id=payload.radio_id,
        show_id=payload.show_id,
        mount=mount,
        title=payload.title,
        description=payload.description,
        recording_id=recording_id,
        output_rel_path=output_rel_path,
        status="running",
    )
    db.add(sess)
    db.add(AuditEvent(actor=user.email, event="live.start", target=f"radio:{payload.radio_id}"))
    db.commit()
    db.refresh(sess)
    return sess


@router.post("/stop")
async def stop(payload: LiveStopRequest, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    sess = (
        db.query(LiveSession)
        .filter(LiveSession.radio_id == payload.radio_id)
        .filter(LiveSession.status == "running")
        .order_by(LiveSession.id.desc())
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="No running live session")

    radio = db.query(Radio).filter(Radio.id == sess.radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        await stop_recording(node.agent_url, recording_id=sess.recording_id)
    except Exception as e:
        # Mark error but still proceed to create episode best-effort (file may exist)
        sess.status = "error"
        db.add(AuditEvent(actor=user.email, event="live.stop.error", target=str(sess.id)))
        db.commit()
        raise HTTPException(status_code=502, detail=f"Failed to stop recording: {e}")

    sess.status = "stopped"
    db.add(AuditEvent(actor=user.email, event="live.stop", target=str(sess.id)))

    ep = PodcastEpisode(
        show_id=sess.show_id,
        title=sess.title,
        description=sess.description,
        audio_rel_path=sess.output_rel_path,
        source="record",
        recorded_from_radio_id=sess.radio_id,
    )
    db.add(ep)
    db.add(AuditEvent(actor=user.email, event="podcast.episode.recorded", target=f"show:{sess.show_id}"))

    db.commit()
    db.refresh(ep)

    return {"ok": True, "episode_id": ep.id, "audio_rel_path": ep.audio_rel_path}
