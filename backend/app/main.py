from __future__ import annotations

import logging
import math
import shutil
import struct
import wave
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.audit import AuditEvent
from app.models.node import Node
from app.models.podcast import PodcastEpisode, PodcastShow
from app.models.radio import Radio
from app.models.user import User
from app.services.agent_client import setup_agent_client, teardown_agent_client
from app.services.cache import setup_cache, teardown_cache

from app.api.auth import router as auth_router
from app.api.nodes import router as nodes_router
from app.api.radios import router as radios_router
from app.api.actions import router as actions_router
from app.api.audit import router as audit_router
from app.api.users import router as users_router
from app.api.ws_logs import router as ws_logs_router
from app.api.ws_ticket import router as ws_ticket_router
from app.api.podcasts import router as podcasts_router
from app.api.live import router as live_router
from app.api.media import router as media_router

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_tone_wav(path: Path, seconds: float = 2.0, freq_hz: float = 440.0, sr: int = 44100):
    path.parent.mkdir(parents=True, exist_ok=True)
    n = int(seconds * sr)
    amp = 0.2
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        for i in range(n):
            t = i / sr
            v = int(amp * 32767.0 * math.sin(2.0 * math.pi * freq_hz * t))
            wf.writeframes(struct.pack("<h", v))


def _run_alembic_upgrade() -> None:
    """Apply any pending Alembic migrations at startup."""
    ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = AlembicConfig(str(ini_path))
    alembic_command.upgrade(cfg, "head")


def _purge_old_audit_events(db: Session) -> None:
    """Delete audit events older than settings.AUDIT_RETAIN_DAYS at startup."""
    if settings.AUDIT_RETAIN_DAYS <= 0:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.AUDIT_RETAIN_DAYS)
    deleted = (
        db.query(AuditEvent)
        .filter(AuditEvent.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        logger.info("Audit retention: purged %d events older than %d days.", deleted, settings.AUDIT_RETAIN_DAYS)
    db.commit()


def bootstrap(db: Session):
    settings.media_root_path.mkdir(parents=True, exist_ok=True)

    try:
        # Default admin
        admin = db.query(User).filter(User.email == settings.BOOTSTRAP_ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                email=settings.BOOTSTRAP_ADMIN_EMAIL,
                password_hash=hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
            db.add(admin)

        # Default node
        node = db.query(Node).filter(Node.name == "local-agent").first()
        if not node:
            node = Node(name="local-agent", agent_url=settings.DEFAULT_AGENT_URL)
            db.add(node)
            db.flush()
            db.refresh(node)

        # Demo radio
        demo_radio = db.query(Radio).filter(Radio.name == "Demo Radio").first()
        if not demo_radio:
            demo_radio = Radio(
                name="Demo Radio",
                description="Liquidsoap demo stream -> Icecast (/stream)",
                node_id=node.id,
                icecast_service="icecast",
                liquidsoap_service="liquidsoap",
                mounts="/stream",
                public_base_url=settings.ICECAST_PUBLIC_BASE_DEFAULT,
                internal_base_url=settings.ICECAST_INTERNAL_BASE_DEFAULT,
            )
            db.add(demo_radio)
            db.flush()

        # Demo playlist audio file
        if demo_radio:
            tracks_dir = settings.media_root_path / "radios" / f"radio_{demo_radio.id}" / "tracks"
            legacy_dir = settings.media_root_path / "radios" / "demo" / "tracks"

            if legacy_dir.exists() and not tracks_dir.exists():
                tracks_dir.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(legacy_dir), str(tracks_dir))
            elif legacy_dir.exists() and tracks_dir.exists():
                for p in legacy_dir.iterdir():
                    if not p.is_file():
                        continue
                    target = tracks_dir / p.name
                    if not target.exists():
                        shutil.move(str(p), str(target))

            tracks_dir.mkdir(parents=True, exist_ok=True)
            if not (tracks_dir / "demo.wav").exists():
                _write_tone_wav(tracks_dir / "demo.wav", seconds=3.0, freq_hz=330.0)

        # Demo podcast show
        demo_show = db.query(PodcastShow).filter(PodcastShow.title == "Demo Podcast").first()
        if not demo_show:
            demo_show = PodcastShow(title="Demo Podcast", description="A demo show seeded at startup.")
            db.add(demo_show)
            db.flush()
            db.refresh(demo_show)

        # Demo podcast episode
        demo_ep = db.query(PodcastEpisode).filter(PodcastEpisode.show_id == demo_show.id).first()
        if not demo_ep:
            rel = f"podcasts/show_{demo_show.id}/demo.wav"
            abs_path = settings.media_root_path / rel
            if not abs_path.exists():
                _write_tone_wav(abs_path, seconds=6.0, freq_hz=220.0)
            db.add(PodcastEpisode(
                show_id=demo_show.id,
                title="Demo Episode",
                description="Seeded demo audio.",
                audio_rel_path=rel,
                source="upload",
                recorded_from_radio_id=None,
            ))

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Bootstrap failed — rolled back all changes")
        raise


# ---------------------------------------------------------------------------
# App — lifespan handles async startup/shutdown cleanly
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.warn_weak_secrets()
    _run_alembic_upgrade()
    settings.media_root_path.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        bootstrap(db)
        _purge_old_audit_events(db)
    finally:
        db.close()

    await setup_agent_client()
    await setup_cache()

    yield  # app is running

    # Shutdown
    await teardown_agent_client()
    await teardown_cache()


app = FastAPI(title="RadioOps Console API", version="0.3.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Prometheus metrics — restricted to internal/loopback requests only.
_METRICS_ALLOWED_PREFIXES = ("127.", "::1", "172.", "10.", "192.168.")

try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    @app.middleware("http")
    async def _restrict_metrics(request: Request, call_next):
        if request.url.path == "/metrics":
            client_ip = (request.headers.get("X-Forwarded-For") or request.client.host or "").split(",")[0].strip()
            if not any(client_ip.startswith(p) for p in _METRICS_ALLOWED_PREFIXES):
                return Response(status_code=403)
        return await call_next(request)

    logger.info("Prometheus metrics exposed at /metrics (internal only)")
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed — /metrics unavailable")


@app.get("/health")
def health():
    return {"ok": True}


# Serve uploaded/recorded media (local mode — bypassed by storage service when S3 is active)
if not settings.S3_ENDPOINT:
    settings.media_root_path.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(settings.media_root_path)), name="media")

if settings.S3_ENDPOINT:
    app.include_router(media_router)

app.include_router(auth_router)
app.include_router(nodes_router)
app.include_router(radios_router)
app.include_router(actions_router)
app.include_router(audit_router)
app.include_router(users_router)
app.include_router(ws_logs_router)
app.include_router(ws_ticket_router)
app.include_router(podcasts_router)
app.include_router(live_router)
