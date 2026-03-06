from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MOCK_MODE: bool = True
    ALLOWED_SERVICES: str = "icecast2,liquidsoap"

    # Shared volume root (recordings / playlists)
    DATA_ROOT: str = "/data"

    # Liquidsoap telnet control (internal Docker network)
    LIQUIDSOAP_TELNET_HOST: str = "liquidsoap"
    LIQUIDSOAP_TELNET_PORT: int = 1234

    # Liquidsoap harbor ingest (internal Docker network)
    LIVE_INGEST_HOST: str = "liquidsoap"
    LIVE_INGEST_PORT: int = 8001
    LIVE_INGEST_MOUNT: str = "/live"
    LIVE_INGEST_PASSWORD: str = "djpass"

    @property
    def allowed_services(self) -> set[str]:
        return {s.strip() for s in self.ALLOWED_SERVICES.split(",") if s.strip()}


settings = Settings()
