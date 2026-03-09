"""Shared file utilities for safe path handling and filename sanitization."""
from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import HTTPException


def safe_filename(name: str, fallback: str = "audio") -> str:
    """Sanitize a filename: strip path separators and keep only safe characters."""
    name = os.path.basename(name or "")
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)
    return name or fallback


def safe_abs_path(root: Path, rel_path: str, *, mkdir: bool = False) -> Path:
    """
    Resolve *rel_path* under *root* and verify the result stays inside *root*.
    Raises HTTP 400 on path-traversal attempts.
    """
    root = root.resolve()
    p = (root / rel_path).resolve()
    if root not in p.parents and p != root:
        raise HTTPException(status_code=400, detail="Invalid media path")
    if mkdir:
        p.parent.mkdir(parents=True, exist_ok=True)
    return p
