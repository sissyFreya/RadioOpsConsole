from __future__ import annotations

import logging
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_WEAK_JWT_SECRET = "change-me-super-secret"
_WEAK_ADMIN_PASSWORD = "admin"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    POSTGRES_USER: str = "radioops"
    POSTGRES_PASSWORD: str = "radioops"
    POSTGRES_DB: str = "radioops"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    JWT_SECRET: str = _WEAK_JWT_SECRET
    JWT_ACCESS_MINUTES: int = 60

    BOOTSTRAP_ADMIN_EMAIL: str = "admin@local"
    BOOTSTRAP_ADMIN_PASSWORD: str = _WEAK_ADMIN_PASSWORD

    DEFAULT_AGENT_URL: str = "http://agent:9000"

    # Storage root for uploaded/recorded media (podcasts, etc.)
    MEDIA_ROOT: str = "/data"

    # Defaults used by the UI (player + recording). Radios can override these.
    ICECAST_PUBLIC_BASE_DEFAULT: str = "http://localhost:8000"
    ICECAST_INTERNAL_BASE_DEFAULT: str = "http://icecast:8000"

    # DJ live ingest (connect your PC to Liquidsoap harbor, not Icecast)
    LIVE_INGEST_PUBLIC_HOST: str = ""  # if empty, derived from radio.public_base_url host
    LIVE_INGEST_PORT: int = 8001
    LIVE_INGEST_MOUNT: str = "/live"
    LIVE_INGEST_PASSWORD_HINT: str = "djpass"  # set a strong secret in production

    # Audit event retention (days). Set to 0 to disable automatic purge.
    AUDIT_RETAIN_DAYS: int = 90

    # Redis cache (optional). Leave empty to disable caching.
    REDIS_URL: str = ""

    # S3/MinIO object storage (optional). Leave S3_ENDPOINT empty to use local filesystem.
    S3_ENDPOINT: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "radioops"
    S3_REGION: str = "us-east-1"
    S3_PRESIGN_TTL: int = 3600

    # CORS — comma-separated list of allowed origins.
    # In production: set to your actual frontend domain(s), e.g. "https://radio.example.com"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def media_root_path(self) -> Path:
        return Path(self.MEDIA_ROOT)

    def warn_weak_secrets(self) -> None:
        """Log prominent warnings if default insecure secrets are still in use."""
        if self.JWT_SECRET == _WEAK_JWT_SECRET:
            logger.critical(
                "SECURITY: JWT_SECRET is set to the default placeholder value. "
                "Set a strong random secret via the JWT_SECRET environment variable before going to production."
            )
        if self.BOOTSTRAP_ADMIN_PASSWORD == _WEAK_ADMIN_PASSWORD:
            logger.critical(
                "SECURITY: BOOTSTRAP_ADMIN_PASSWORD is 'admin'. "
                "Change the admin password immediately after first login or set BOOTSTRAP_ADMIN_PASSWORD in .env."
            )
        if self.LIVE_INGEST_PASSWORD_HINT == "djpass":
            logger.warning(
                "SECURITY: LIVE_INGEST_PASSWORD_HINT is the default 'djpass'. "
                "Set a strong ingest password in Liquidsoap and update LIVE_INGEST_PASSWORD_HINT."
            )
        if self.ICECAST_PUBLIC_BASE_DEFAULT.startswith("http://localhost") or \
                self.ICECAST_PUBLIC_BASE_DEFAULT.startswith("http://127.0.0.1"):
            logger.warning(
                "CONFIG: ICECAST_PUBLIC_BASE_DEFAULT is set to localhost (%s). "
                "Set ICECAST_PUBLIC_BASE to your server's public IP or domain in production.",
                self.ICECAST_PUBLIC_BASE_DEFAULT,
            )


settings = Settings()
