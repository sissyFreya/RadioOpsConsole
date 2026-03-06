from datetime import datetime

from pydantic import BaseModel


class AuditEventOut(BaseModel):
    id: int
    actor: str
    event: str
    target: str | None
    result: str
    details: str | None
    ip_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True