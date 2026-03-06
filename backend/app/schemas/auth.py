from pydantic import BaseModel


class LoginRequest(BaseModel):
    # Accept non-RFC "email-like" identifiers (e.g. "admin@local") to support
    # fully offline/local deployments.
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    email: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
