"""
Media storage abstraction.

Two backends are supported:
  - Local filesystem (default): files written to MEDIA_ROOT, served via StaticFiles.
  - S3/MinIO (when S3_ENDPOINT is set): files uploaded to S3, downloads served
    via time-limited pre-signed URLs returned by GET /media/{path}.

All callers use the four public coroutines:
    storage_write(rel_path, data)        -> None
    storage_read(rel_path)               -> bytes | None
    storage_delete(rel_path)             -> None
    storage_url(rel_path, request)       -> str   (public URL or presigned URL)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import Request

logger = logging.getLogger(__name__)


def _get_s3_client():
    """Return a boto3 S3 client configured for the S3/MinIO endpoint."""
    import boto3  # type: ignore[import-untyped]
    from app.core.config import settings

    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT or None,
        aws_access_key_id=settings.S3_ACCESS_KEY or None,
        aws_secret_access_key=settings.S3_SECRET_KEY or None,
        region_name=settings.S3_REGION,
    )


async def storage_write(rel_path: str, data: bytes) -> None:
    """Persist *data* at the given relative path."""
    from app.core.config import settings

    if settings.S3_ENDPOINT:
        import asyncio

        client = _get_s3_client()
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.put_object(Bucket=settings.S3_BUCKET, Key=rel_path, Body=data),
        )
        logger.debug("S3 upload: s3://%s/%s (%d bytes)", settings.S3_BUCKET, rel_path, len(data))
    else:
        abs_path = settings.media_root_path / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(data)


async def storage_read(rel_path: str) -> bytes | None:
    """Return raw bytes for *rel_path*, or None if the object does not exist."""
    from app.core.config import settings

    if settings.S3_ENDPOINT:
        import asyncio

        client = _get_s3_client()
        try:
            resp = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.get_object(Bucket=settings.S3_BUCKET, Key=rel_path),
            )
            return resp["Body"].read()
        except client.exceptions.NoSuchKey:
            return None
    else:
        abs_path = settings.media_root_path / rel_path
        return abs_path.read_bytes() if abs_path.exists() else None


async def storage_delete(rel_path: str) -> None:
    """Remove *rel_path* from the active storage backend."""
    from app.core.config import settings

    if settings.S3_ENDPOINT:
        import asyncio

        client = _get_s3_client()
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.delete_object(Bucket=settings.S3_BUCKET, Key=rel_path),
        )
    else:
        abs_path = settings.media_root_path / rel_path
        if abs_path.exists():
            abs_path.unlink()


def storage_url(rel_path: str, request: "Request | None" = None) -> str:
    """
    Return the URL a client should use to download *rel_path*.

    - S3 mode  : time-limited presigned GET URL.
    - Local mode: absolute URL constructed from the incoming request base URL,
                  falling back to a relative /media/... path.
    """
    from app.core.config import settings

    if settings.S3_ENDPOINT:
        client = _get_s3_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": rel_path},
            ExpiresIn=settings.S3_PRESIGN_TTL,
        )

    # Local mode
    if request is not None:
        base = str(request.base_url).rstrip("/")
        return f"{base}/media/{rel_path}"
    return f"/media/{rel_path}"
