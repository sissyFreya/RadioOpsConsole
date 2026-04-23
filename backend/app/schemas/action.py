from pydantic import BaseModel, ConfigDict, Field


class ActionCreate(BaseModel):
    node_id: int
    service: str = Field(min_length=1, max_length=128)
    action: str = Field(pattern="^(restart|reload)$")


class ActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    requested_by: str
    node_id: int
    service: str
    action: str
    status: str
    output: str | None
