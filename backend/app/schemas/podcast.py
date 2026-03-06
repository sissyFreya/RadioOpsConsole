from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PodcastShowCreate(BaseModel):
    title: str
    description: str | None = None
    artwork_url: str | None = None


class PodcastShowUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    artwork_url: str | None = None


class PodcastShowOut(BaseModel):
    id: int
    title: str
    description: str | None
    artwork_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class PodcastEpisodeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class PodcastEpisodeOut(BaseModel):
    id: int
    show_id: int
    title: str
    description: str | None
    audio_rel_path: str
    source: str
    recorded_from_radio_id: int | None
    created_at: datetime
    size_bytes: int | None = None
    modified_at: datetime | None = None

    class Config:
        from_attributes = True
