"""
Structured JSON logging with request_id injection.

Call setup_logging() once at application startup (before any loggers are used).
The request_id_var ContextVar is set by the HTTP middleware in main.py so that
every log line emitted during a request carries its X-Request-Id.
"""
from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Async-safe carrier: middleware sets this; the formatter reads it.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get("-"),
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)
    if level > logging.DEBUG:
        for noisy in ("httpx", "httpcore", "uvicorn.access", "boto3", "botocore", "s3transfer"):
            logging.getLogger(noisy).setLevel(logging.WARNING)
