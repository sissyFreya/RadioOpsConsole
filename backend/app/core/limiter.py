"""
Centralized rate limiter (slowapi).

Usage in a router:
    from app.core.limiter import limiter
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded

    @router.post("/login")
    @limiter.limit("10/minute")
    async def login(request: Request, ...):
        ...

The limiter is keyed on the client IP address by default.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
