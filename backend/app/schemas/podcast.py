from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PodcastShowCreate(BaseModel):
    title: str
    description: str | None = None
    artwork_url: str | None = None


class PodcastShowUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    artwork_url: str | None = None


class PodcastShowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    artwork_url: str | None
    created_at: datetime


class PodcastEpisodeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class PodcastEpisodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
