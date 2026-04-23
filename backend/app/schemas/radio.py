from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, field_validator


def _validate_http_url(v: str | None) -> str | None:
    """Accept empty/None (treated as 'use default'), reject non-http(s) values."""
    if not v:
        return v
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http or https scheme")
    if not parsed.netloc:
        raise ValueError("URL must include a host")
    return v.rstrip("/")


class RadioCreate(BaseModel):
    name: str
    description: str | None = None
    node_id: int
    icecast_service: str = "icecast"
    # Leave blank: auto-assigned to liquidsoap_{id} on the server side
    liquidsoap_service: str | None = None
    # Leave blank: auto-assigned to /{name-slug} on the server side
    mounts: str | None = None
    public_base_url: str | None = None
    internal_base_url: str | None = None

    @field_validator("public_base_url", "internal_base_url", mode="before")
    @classmethod
    def validate_base_urls(cls, v):
        return _validate_http_url(v)


class RadioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    node_id: int | None = None
    icecast_service: str | None = None
    liquidsoap_service: str | None = None
    mounts: str | None = None
    public_base_url: str | None = None
    internal_base_url: str | None = None

    @field_validator("public_base_url", "internal_base_url", mode="before")
    @classmethod
    def validate_base_urls(cls, v):
        return _validate_http_url(v)


class RadioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    node_id: int
    icecast_service: str
    liquidsoap_service: str
    mounts: str
    public_base_url: str
    internal_base_url: str


class RadioPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    mounts: str
    public_base_url: str


class RadioTrackOut(BaseModel):
    name: str
    rel_path: str
    size_bytes: int
    modified_at: datetime
