"""
Media proxy route — used when S3_ENDPOINT is configured.

In local mode, FastAPI's StaticFiles mount handles /media/ directly.
In S3 mode, this router intercepts GET /media/{path} and redirects
the client to a time-limited presigned URL from the S3/MinIO bucket.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.services.storage import storage_read, storage_url

router = APIRouter(tags=["media"])


@router.get("/media/{path:path}")
async def serve_media(path: str, request: Request):
    """
    S3 mode: redirect to presigned URL.
    Fallback: stream the object directly (useful when presigning fails).
    """
    from app.core.config import settings

    if not settings.S3_ENDPOINT:
        # Should be unreachable: StaticFiles handles this in local mode.
        raise HTTPException(status_code=404, detail="Not found")

    try:
        url = storage_url(path, request)
        return RedirectResponse(url=url, status_code=302)
    except Exception as exc:
        # Fallback: read and stream directly
        data = await storage_read(path)
        if data is None:
            raise HTTPException(status_code=404, detail="Media not found")
        from fastapi.responses import Response
        import mimetypes
        ctype, _ = mimetypes.guess_type(path)
        return Response(content=data, media_type=ctype or "application/octet-stream")
