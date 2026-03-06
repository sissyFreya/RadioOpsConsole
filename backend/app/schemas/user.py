from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="viewer", pattern="^(admin|ops|viewer)$")


class UserUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|ops|viewer)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
