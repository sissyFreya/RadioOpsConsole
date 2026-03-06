"""
Redis-backed cache service.

When REDIS_URL is set, results are cached in Redis with a configurable TTL.
When Redis is unavailable or not configured, all operations are no-ops so
the rest of the application continues to work without any caching.

Usage:
    from app.services.cache import cache_get, cache_set, cache_delete

    data = await cache_get("my-key")
    if data is None:
        data = await expensive_operation()
        await cache_set("my-key", data, ttl=8)
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_redis: Any = None  # redis.asyncio.Redis instance or None


async def setup_cache() -> None:
    global _redis
    from app.core.config import settings

    if not settings.REDIS_URL:
        logger.info("REDIS_URL not set — running without cache.")
        return

    try:
        import redis.asyncio as aioredis  # type: ignore[import-untyped]

        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await _redis.ping()
        logger.info("Redis cache connected: %s", settings.REDIS_URL)
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — cache disabled.", exc)
        _redis = None


async def teardown_cache() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def cache_get(key: str) -> Any | None:
    """Return the deserialized value for *key*, or None on miss / error."""
    if _redis is None:
        return None
    try:
        raw = await _redis.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.debug("cache_get error: %s", exc)
        return None


async def cache_set(key: str, value: Any, ttl: int = 10) -> None:
    """Serialize *value* and store it under *key* with the given TTL (seconds)."""
    if _redis is None:
        return
    try:
        await _redis.setex(key, ttl, json.dumps(value))
    except Exception as exc:
        logger.debug("cache_set error: %s", exc)


async def cache_delete(key: str) -> None:
    """Evict *key* from cache (e.g., after a mutation)."""
    if _redis is None:
        return
    try:
        await _redis.delete(key)
    except Exception as exc:
        logger.debug("cache_delete error: %s", exc)


async def cache_delete_prefix(prefix: str) -> None:
    """Delete all keys matching *prefix** (SCAN-based, safe for production)."""
    if _redis is None:
        return
    try:
        cursor = 0
        pattern = f"{prefix}*"
        while True:
            cursor, keys = await _redis.scan(cursor, match=pattern, count=100)
            if keys:
                await _redis.delete(*keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.debug("cache_delete_prefix error: %s", exc)
