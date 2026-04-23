import mimetypes
import uuid
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.limiter import limiter
from app.core.metrics import podcast_upload_total
from app.services.storage import storage_delete, storage_write
from app.core.config import settings
from app.db.session import get_db
from app.models.audit import AuditEvent
from app.models.podcast import PodcastEpisode, PodcastShow
from app.schemas.podcast import (
    PodcastEpisodeOut,
    PodcastEpisodeUpdate,
    PodcastShowCreate,
    PodcastShowOut,
    PodcastShowUpdate,
)
from app.utils.files import safe_abs_path, safe_filename

router = APIRouter(prefix="/podcasts", tags=["podcasts"])

_EPISODE_MAX_BYTES = 500 * 1024 * 1024  # 500 MB
_ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".opus"}


def _abs_media_path(rel_path: str) -> Path:
    return safe_abs_path(settings.media_root_path.resolve(), rel_path)


def _validate_episode_file(filename: str, content_length: int | None) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Accepted: {', '.join(sorted(_ALLOWED_AUDIO_EXTENSIONS))}",
        )
    if content_length is not None and content_length > _EPISODE_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {_EPISODE_MAX_BYTES // (1024 * 1024)} MB.",
        )


async def _read_upload_limited(file: UploadFile, max_bytes: int) -> bytes:
    data = bytearray()
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum allowed size is {max_bytes // (1024 * 1024)} MB.",
                )
        return bytes(data)
    finally:
        await file.close()


async def _write_upload_limited_local(file: UploadFile, rel_path: str, max_bytes: int) -> None:
    dest = safe_abs_path(settings.media_root_path.resolve(), rel_path, mkdir=True)
    tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex}.tmp")
    written = 0
    try:
        with tmp.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed size is {max_bytes // (1024 * 1024)} MB.",
                    )
                out.write(chunk)
        tmp.replace(dest)
    finally:
        await file.close()
        tmp.unlink(missing_ok=True)


async def _store_episode_upload(file: UploadFile, rel_path: str) -> None:
    if settings.S3_ENDPOINT:
        data = await _read_upload_limited(file, _EPISODE_MAX_BYTES)
        await storage_write(rel_path, data)
        return
    await _write_upload_limited_local(file, rel_path, _EPISODE_MAX_BYTES)


def _episode_file_meta(rel_path: str) -> tuple[int | None, datetime | None]:
    try:
        abs_path = _abs_media_path(rel_path)
        if abs_path.exists():
            st = abs_path.stat()
            return st.st_size, datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
    except Exception:
        pass
    return None, None


def _episode_out(ep: PodcastEpisode) -> dict:
    size_bytes, modified_at = _episode_file_meta(ep.audio_rel_path)
    return {
        "id": ep.id,
        "show_id": ep.show_id,
        "title": ep.title,
        "description": ep.description,
        "audio_rel_path": ep.audio_rel_path,
        "source": ep.source,
        "recorded_from_radio_id": ep.recorded_from_radio_id,
        "created_at": ep.created_at,
        "size_bytes": size_bytes,
        "modified_at": modified_at,
    }


@router.get("/shows", response_model=list[PodcastShowOut])
def list_shows(db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    return db.query(PodcastShow).order_by(PodcastShow.id.asc()).all()


@router.post("/shows", response_model=PodcastShowOut)
def create_show(payload: PodcastShowCreate, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    show = PodcastShow(title=payload.title, description=payload.description, artwork_url=payload.artwork_url)
    db.add(show)
    db.add(AuditEvent(actor=user.email, event="podcast.show.create", target=payload.title))
    db.commit()
    db.refresh(show)
    return show


@router.get("/shows/{show_id}", response_model=PodcastShowOut)
def get_show(show_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    return show


@router.put("/shows/{show_id}", response_model=PodcastShowOut)
def update_show(show_id: int, payload: PodcastShowUpdate, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    for field in ["title", "description", "artwork_url"]:
        v = getattr(payload, field)
        if v is not None:
            setattr(show, field, v)

    db.add(AuditEvent(actor=user.email, event="podcast.show.update", target=str(show_id)))
    db.commit()
    db.refresh(show)
    return show


@router.delete("/shows/{show_id}")
def delete_show(show_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops"))):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    db.delete(show)
    db.add(AuditEvent(actor=user.email, event="podcast.show.delete", target=str(show_id)))
    db.commit()
    return {"ok": True}


@router.get("/shows/{show_id}/episodes", response_model=list[PodcastEpisodeOut])
def list_episodes(show_id: int, db: Session = Depends(get_db), user=Depends(require_role("admin", "ops", "viewer"))):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    episodes = (
        db.query(PodcastEpisode)
        .filter(PodcastEpisode.show_id == show_id)
        .order_by(PodcastEpisode.id.desc())
        .all()
    )
    return [_episode_out(ep) for ep in episodes]


@router.post("/shows/{show_id}/episodes/upload", response_model=PodcastEpisodeOut)
@limiter.limit("10/minute")
async def upload_episode(
    request: Request,
    show_id: int,
    file: UploadFile = File(...),
    title: str | None = None,
    description: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    try:
        _validate_episode_file(file.filename or "episode", file.size)
    except HTTPException:
        await file.close()
        podcast_upload_total.labels(status="rejected").inc()
        raise

    safe_name = safe_filename(file.filename or "episode")
    ext = Path(safe_name).suffix.lower() or ".bin"
    rel_path = f"podcasts/show_{show_id}/{uuid.uuid4().hex}{ext}"

    try:
        await _store_episode_upload(file, rel_path)
    except HTTPException:
        podcast_upload_total.labels(status="rejected").inc()
        raise
    except Exception:
        podcast_upload_total.labels(status="error").inc()
        raise

    ep = PodcastEpisode(
        show_id=show_id,
        title=title or Path(safe_name).stem,
        description=description,
        audio_rel_path=rel_path,
        source="upload",
        recorded_from_radio_id=None,
    )
    db.add(ep)
    db.add(AuditEvent(actor=user.email, event="podcast.episode.upload", target=f"show:{show_id}"))
    db.commit()
    db.refresh(ep)
    podcast_upload_total.labels(status="ok").inc()
    return _episode_out(ep)


@router.put("/episodes/{episode_id}", response_model=PodcastEpisodeOut)
def update_episode(
    episode_id: int,
    payload: PodcastEpisodeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    ep = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    for field in ["title", "description"]:
        v = getattr(payload, field)
        if v is not None:
            setattr(ep, field, v)

    db.add(AuditEvent(actor=user.email, event="podcast.episode.update", target=str(episode_id)))
    db.commit()
    db.refresh(ep)
    return _episode_out(ep)


@router.delete("/episodes/{episode_id}")
async def delete_episode(
    episode_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role("admin", "ops")),
):
    ep = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Best-effort file removal (works for both local and S3)
    try:
        await storage_delete(ep.audio_rel_path)
    except Exception:
        pass

    db.delete(ep)
    db.add(AuditEvent(actor=user.email, event="podcast.episode.delete", target=str(episode_id)))
    db.commit()
    return {"ok": True}


@router.get("/shows/{show_id}/feed")
def show_feed(show_id: int, request: Request, db: Session = Depends(get_db)):
    show = db.query(PodcastShow).filter(PodcastShow.id == show_id).first()
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    episodes = (
        db.query(PodcastEpisode)
        .filter(PodcastEpisode.show_id == show_id)
        .order_by(PodcastEpisode.id.desc())
        .all()
    )

    base = str(request.base_url).rstrip("/")
    channel_link = f"{base}/podcasts/shows/{show_id}"
    feed_link = f"{base}/podcasts/shows/{show_id}/feed"

    last_build = None
    if episodes:
        last_build = episodes[0].created_at

    image_block = ""
    if show.artwork_url:
        image_block = (
            "    <image>\n"
            f"      <url>{escape(show.artwork_url)}</url>\n"
            f"      <title>{escape(show.title)}</title>\n"
            f"      <link>{escape(channel_link)}</link>\n"
            "    </image>\n"
        )

    items_xml = []
    for ep in episodes:
        size_bytes, _modified_at = _episode_file_meta(ep.audio_rel_path)
        audio_url = f"{base}/media/{quote(ep.audio_rel_path)}"
        mime = mimetypes.guess_type(audio_url)[0] or "audio/mpeg"
        pub_date = format_datetime(ep.created_at or datetime.now(tz=timezone.utc))
        description = escape(ep.description or "")
        title = escape(ep.title)

        items_xml.append(
            "    <item>\n"
            f"      <title>{title}</title>\n"
            f"      <description>{description}</description>\n"
            f"      <link>{escape(audio_url)}</link>\n"
            f"      <guid isPermaLink=\"false\">episode-{ep.id}</guid>\n"
            f"      <pubDate>{pub_date}</pubDate>\n"
            f"      <enclosure url=\"{escape(audio_url)}\" length=\"{size_bytes or 0}\" type=\"{mime}\" />\n"
            "    </item>\n"
        )

    last_build_str = format_datetime(last_build or datetime.now(tz=timezone.utc))
    xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n"
        "  <channel>\n"
        f"    <title>{escape(show.title)}</title>\n"
        f"    <description>{escape(show.description or '')}</description>\n"
        f"    <link>{escape(channel_link)}</link>\n"
        f"    <atom:link href=\"{escape(feed_link)}\" rel=\"self\" type=\"application/rss+xml\" />\n"
        f"    <lastBuildDate>{last_build_str}</lastBuildDate>\n"
        "    <language>en</language>\n"
        f"{image_block}"
        f"{''.join(items_xml)}"
        "  </channel>\n"
        "</rss>\n"
    )

    return Response(content=xml, media_type="application/rss+xml")
