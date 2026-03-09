from __future__ import annotations

from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.node import Node
from app.models.radio import Radio
from app.schemas.radio import RadioCreate, RadioOut, RadioPublicOut, RadioTrackOut, RadioUpdate
from app.services.agent_client import fetch_icecast_stats, fetch_status, takeover_disable, takeover_enable, takeover_status
from app.utils.files import safe_abs_path, safe_filename

router = APIRouter(prefix="/radios", tags=["radios"])

# Upload limits
_TRACK_MAX_BYTES = 500 * 1024 * 1024  # 500 MB
_ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".opus"}


def _validate_track_file(filename: str, content_length: int | None) -> None:
    """Raise HTTPException for disallowed extension or excessive size."""
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Accepted: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )
    if content_length is not None and content_length > _TRACK_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {_TRACK_MAX_BYTES // (1024 * 1024)} MB.",
        )


def _radio_tracks_dir(radio_id: int) -> Path:
    root = settings.media_root_path.resolve()
    return safe_abs_path(root, f"radios/radio_{radio_id}/tracks", mkdir=True)


def _unique_path(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem = dest.stem
    suffix = dest.suffix
    i = 1
    while True:
        candidate = dest.with_name(f"{stem}-{i}{suffix}")
        if not candidate.exists():
            return candidate
        i += 1


def _resolve_public_base(url: str | None) -> str:
    """Return the configured public base URL, falling back to settings if unset or localhost."""
    if url and not url.startswith("http://localhost") and not url.startswith("http://127.0.0.1"):
        return url
    return settings.ICECAST_PUBLIC_BASE_DEFAULT


def _radio_public_out(radio: Radio) -> dict:
    return {
        "id": radio.id,
        "name": radio.name,
        "description": radio.description,
        "mounts": radio.mounts,
        "public_base_url": _resolve_public_base(radio.public_base_url),
    }


@router.get("/public", response_model=list[RadioPublicOut])
def list_public_radios(db: Session = Depends(get_db)):
    radios = db.query(Radio).order_by(Radio.id.asc()).all()
    return [_radio_public_out(radio) for radio in radios]


@router.get("/", response_model=list[RadioOut])
def list_radios(db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    return db.query(Radio).order_by(Radio.id.asc()).all()


@router.post("/", response_model=RadioOut)
def create_radio(payload: RadioCreate, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    node = db.query(Node).filter(Node.id == payload.node_id).first()
    if not node:
        raise HTTPException(status_code=400, detail="Invalid node_id")

    radio = Radio(
        name=payload.name,
        description=payload.description,
        node_id=payload.node_id,
        icecast_service=payload.icecast_service,
        liquidsoap_service=payload.liquidsoap_service,
        mounts=payload.mounts,
        public_base_url=_resolve_public_base(payload.public_base_url),
        internal_base_url=payload.internal_base_url or settings.ICECAST_INTERNAL_BASE_DEFAULT,
    )
    db.add(radio)
    db.add(AuditEvent(actor=user.email, event="radio.create", target=payload.name))
    db.commit()
    db.refresh(radio)
    _radio_tracks_dir(radio.id)
    return radio


@router.get("/{radio_id}", response_model=RadioOut)
def get_radio(radio_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")
    return radio


@router.put("/{radio_id}", response_model=RadioOut)
def update_radio(
    radio_id: int,
    payload: RadioUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    if payload.node_id is not None:
        node = db.query(Node).filter(Node.id == payload.node_id).first()
        if not node:
            raise HTTPException(status_code=400, detail="Invalid node_id")
        radio.node_id = payload.node_id

    for field in [
        "name",
        "description",
        "icecast_service",
        "liquidsoap_service",
        "mounts",
        "public_base_url",
        "internal_base_url",
    ]:
        v = getattr(payload, field)
        if v is not None:
            setattr(radio, field, v)

    db.add(AuditEvent(actor=user.email, event="radio.update", target=str(radio_id)))
    db.commit()
    db.refresh(radio)
    return radio


@router.delete("/{radio_id}")
def delete_radio(radio_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    db.delete(radio)
    db.add(AuditEvent(actor=user.email, event="radio.delete", target=str(radio_id)))
    db.commit()
    return {"ok": True}


@router.get("/{radio_id}/icecast-stats")
async def get_icecast_stats(
    radio_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops", "viewer")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    base_url = (radio.internal_base_url or settings.ICECAST_INTERNAL_BASE_DEFAULT).rstrip("/")
    try:
        raw = await fetch_icecast_stats(base_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Icecast unreachable: {e}")

    icestats = raw.get("icestats", {})
    sources = icestats.get("source", [])
    if isinstance(sources, dict):
        sources = [sources]

    mounts = [
        {
            "mount": urlparse(s.get("listenurl", "")).path or "/",
            "listeners": s.get("listeners", 0),
            "title": s.get("title") or s.get("song") or None,
            "bitrate": s.get("bitrate"),
            "server_name": s.get("server_name"),
        }
        for s in (sources or [])
    ]
    total_listeners = sum(int(m["listeners"] or 0) for m in mounts)
    return {"radio_id": radio_id, "total_listeners": total_listeners, "mounts": mounts}


@router.get("/{radio_id}/status")
async def get_radio_status(radio_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        status_data = await fetch_status(node.agent_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")

    return {
        "radio": {
            "id": radio.id,
            "name": radio.name,
            "node_id": radio.node_id,
            "mounts": [m.strip() for m in (radio.mounts or "").split(",") if m.strip()],
            "icecast_service": radio.icecast_service,
            "liquidsoap_service": radio.liquidsoap_service,
            "public_base_url": _resolve_public_base(radio.public_base_url),
            "internal_base_url": radio.internal_base_url,
        },
        "node": {"id": node.id, "name": node.name, "agent_url": node.agent_url},
        "services": status_data.get("services", {}),
        "system": status_data.get("system", {}),
    }

@router.get("/{radio_id}/takeover/status")
async def get_takeover_status(
    radio_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops", "viewer")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        st = await takeover_status(node.agent_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")

    # Build public ingest host for UX (if not configured explicitly)
    ingest_host = settings.LIVE_INGEST_PUBLIC_HOST
    if not ingest_host:
        parsed = urlparse(radio.public_base_url)
        ingest_host = parsed.hostname or "localhost"

    return {
        "radio_id": radio.id,
        "enabled": st.get("enabled"),
        "connected": st.get("connected"),
        "raw": st.get("raw"),
        "ingest": {
            "host": ingest_host,
            "port": settings.LIVE_INGEST_PORT,
            "mount": settings.LIVE_INGEST_MOUNT,
            "password_hint": settings.LIVE_INGEST_PASSWORD_HINT,
        },
    }


@router.post("/{radio_id}/takeover/enable")
async def enable_takeover(
    radio_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        res = await takeover_enable(node.agent_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")

    db.add(AuditEvent(actor=user.email, event="takeover.enable", target=str(radio_id)))
    db.commit()
    return res


@router.post("/{radio_id}/takeover/disable")
async def disable_takeover(
    radio_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    node = db.query(Node).filter(Node.id == radio.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    try:
        res = await takeover_disable(node.agent_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {e}")

    db.add(AuditEvent(actor=user.email, event="takeover.disable", target=str(radio_id)))
    db.commit()
    return res


_TRACKS_MAX = 1000


@router.get("/{radio_id}/tracks", response_model=list[RadioTrackOut])
def list_tracks(
    radio_id: int,
    offset: int = 0,
    limit: int = _TRACKS_MAX,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops", "viewer")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    limit = min(limit, _TRACKS_MAX)
    tracks_dir = _radio_tracks_dir(radio_id)
    root = settings.media_root_path.resolve()

    all_files = sorted(
        (p for p in tracks_dir.iterdir() if p.is_file()),
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    )

    items: list[RadioTrackOut] = []
    for p in all_files[offset: offset + limit]:
        st = p.stat()
        rel = p.relative_to(root).as_posix()
        items.append(
            RadioTrackOut(
                name=p.name,
                rel_path=rel,
                size_bytes=st.st_size,
                modified_at=datetime.fromtimestamp(st.st_mtime),
            )
        )

    return items


@router.post("/{radio_id}/tracks/upload", response_model=RadioTrackOut)
async def upload_track(
    radio_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    # Validate extension and Content-Length header (if provided by the client)
    _validate_track_file(file.filename or "track", file.size)

    tracks_dir = _radio_tracks_dir(radio_id)
    safe_name = safe_filename(file.filename or "track")
    dest = _unique_path(tracks_dir / safe_name)

    written = 0
    try:
        with dest.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > _TRACK_MAX_BYTES:
                    # Abort mid-stream: remove partial file before raising
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed size is {_TRACK_MAX_BYTES // (1024 * 1024)} MB.",
                    )
                f.write(chunk)
    finally:
        await file.close()

    st = dest.stat()
    rel = dest.relative_to(settings.media_root_path.resolve()).as_posix()

    db.add(AuditEvent(actor=user.email, event="radio.track.upload", target=str(radio_id)))
    db.commit()

    return RadioTrackOut(
        name=dest.name,
        rel_path=rel,
        size_bytes=st.st_size,
        modified_at=datetime.fromtimestamp(st.st_mtime),
    )


@router.delete("/{radio_id}/tracks/{track_name}")
def delete_track(
    radio_id: int,
    track_name: str,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    radio = db.query(Radio).filter(Radio.id == radio_id).first()
    if not radio:
        raise HTTPException(status_code=404, detail="Radio not found")

    tracks_dir = _radio_tracks_dir(radio_id)
    raw_name = os.path.basename(track_name)
    if raw_name != track_name:
        raise HTTPException(status_code=400, detail="Invalid track name")
    target = (tracks_dir / raw_name).resolve()
    if target.parent != tracks_dir:
        raise HTTPException(status_code=400, detail="Invalid track name")
    if not target.exists():
        raise HTTPException(status_code=404, detail="Track not found")

    target.unlink()
    db.add(AuditEvent(actor=user.email, event="radio.track.delete", target=str(radio_id)))
    db.commit()
    return {"ok": True}
