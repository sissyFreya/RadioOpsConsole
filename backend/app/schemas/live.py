from __future__ import annotations

from pydantic import BaseModel


class LiveStartRequest(BaseModel):
    radio_id: int
    show_id: int
    mount: str
    title: str
    description: str | None = None


class LiveStopRequest(BaseModel):
    radio_id: int


class LiveSessionOut(BaseModel):
    id: int
    radio_id: int
    show_id: int
    mount: str
    title: str
    description: str | None
    recording_id: str
    output_rel_path: str
    status: str

    class Config:
        from_attributes = True
