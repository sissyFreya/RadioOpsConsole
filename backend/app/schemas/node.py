from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_agent_url(v: str | None) -> str | None:
    if v is None:
        return v
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("agent_url must use http or https scheme")
    if not parsed.netloc:
        raise ValueError("agent_url must include a host")
    if parsed.username or parsed.password:
        raise ValueError("agent_url must not contain credentials")
    return v.rstrip("/")


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    agent_url: str

    @field_validator("agent_url", mode="before")
    @classmethod
    def validate_agent_url(cls, v):
        return _validate_agent_url(v)


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    agent_url: str | None = None

    @field_validator("agent_url", mode="before")
    @classmethod
    def validate_agent_url(cls, v):
        return _validate_agent_url(v)


class NodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    agent_url: str
    created_at: datetime
