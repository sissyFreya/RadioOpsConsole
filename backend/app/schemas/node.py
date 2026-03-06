from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NodeCreate(BaseModel):
    name: str
    agent_url: str


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    agent_url: Optional[str] = None


class NodeOut(BaseModel):
    id: int
    name: str
    agent_url: str
    created_at: datetime

    class Config:
        from_attributes = True
