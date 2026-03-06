from pydantic import BaseModel


class ActionCreate(BaseModel):
    node_id: int
    service: str
    action: str  # restart|reload


class ActionOut(BaseModel):
    id: int
    requested_by: str
    node_id: int
    service: str
    action: str
    status: str
    output: str | None

    class Config:
        from_attributes = True
