from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class PodcastShow(Base):
    __tablename__ = "podcast_shows"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    artwork_url = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    episodes = relationship("PodcastEpisode", cascade="all, delete-orphan", back_populates="show")


class PodcastEpisode(Base):
    __tablename__ = "podcast_episodes"

    id = Column(Integer, primary_key=True, index=True)
    show_id = Column(Integer, ForeignKey("podcast_shows.id", ondelete="CASCADE"), nullable=False)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Relative path under MEDIA_ROOT (e.g., "podcasts/show_1/ep_3.mp3")
    audio_rel_path = Column(String(1024), nullable=False)

    source = Column(String(64), nullable=False, default="upload")  # upload|record
    recorded_from_radio_id = Column(Integer, ForeignKey("radios.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    show = relationship("PodcastShow", back_populates="episodes")
