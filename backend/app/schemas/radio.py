from datetime import datetime

from pydantic import BaseModel


class RadioCreate(BaseModel):
    name: str
    description: str | None = None
    node_id: int
    icecast_service: str = "icecast2"
    liquidsoap_service: str = "liquidsoap"
    mounts: str = "/stream"
    public_base_url: str | None = None
    internal_base_url: str | None = None


class RadioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    node_id: int | None = None
    icecast_service: str | None = None
    liquidsoap_service: str | None = None
    mounts: str | None = None
    public_base_url: str | None = None
    internal_base_url: str | None = None


class RadioOut(BaseModel):
    id: int
    name: str
    description: str | None
    node_id: int
    icecast_service: str
    liquidsoap_service: str
    mounts: str
    public_base_url: str
    internal_base_url: str

    class Config:
        from_attributes = True


class RadioPublicOut(BaseModel):
    id: int
    name: str
    description: str | None
    mounts: str
    public_base_url: str

    class Config:
        from_attributes = True


class RadioTrackOut(BaseModel):
    name: str
    rel_path: str
    size_bytes: int
    modified_at: datetime
