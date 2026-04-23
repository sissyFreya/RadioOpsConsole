from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor: str
    event: str
    target: str | None
    result: str
    details: str | None
    ip_address: str | None
    created_at: datetime
