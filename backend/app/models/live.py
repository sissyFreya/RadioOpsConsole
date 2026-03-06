from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.models.base import Base


class LiveSession(Base):
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, index=True)
    radio_id = Column(Integer, ForeignKey("radios.id", ondelete="CASCADE"), nullable=False)
    show_id = Column(Integer, ForeignKey("podcast_shows.id", ondelete="CASCADE"), nullable=False)

    mount = Column(String(256), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    recording_id = Column(String(128), nullable=False)
    output_rel_path = Column(String(1024), nullable=False)

    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    stopped_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), nullable=False, default="running")  # running|stopped|error
