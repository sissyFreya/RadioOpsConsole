from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MOCK_MODE: bool = True
    ALLOWED_SERVICES: str = "icecast,liquidsoap"
    AGENT_SHARED_TOKEN: str = "dev-agent-token"

    # Shared volume root (recordings / playlists)
    DATA_ROOT: str = "/data"

    # Per-radio Liquidsoap routing map.
    # Format: "radio_id:liquidsoap_host:telnet_port:ingest_port[,...]"
    # Example: "1:liquidsoap_1:1234:8001,2:liquidsoap_2:1234:8002"
    # When empty, falls back to the single-instance defaults below.
    RADIO_LIQUIDSOAP_MAP: str = ""

    # Single-instance fallback (used when RADIO_LIQUIDSOAP_MAP is empty)
    LIQUIDSOAP_TELNET_HOST: str = "liquidsoap"
    LIQUIDSOAP_TELNET_PORT: int = 1234
    LIVE_INGEST_HOST: str = "liquidsoap"
    LIVE_INGEST_PORT: int = 8001
    LIVE_INGEST_MOUNT: str = "/live"
    LIVE_INGEST_PASSWORD: str = "djpass"

    @property
    def allowed_services(self) -> set[str]:
        return {s.strip() for s in self.ALLOWED_SERVICES.split(",") if s.strip()}

    def get_liquidsoap_addr(self, radio_id: str) -> tuple[str, int, int]:
        """Return (telnet_host, telnet_port, ingest_port) for a given radio_id."""
        if self.RADIO_LIQUIDSOAP_MAP:
            for entry in self.RADIO_LIQUIDSOAP_MAP.split(","):
                parts = entry.strip().split(":")
                if len(parts) >= 3 and parts[0] == radio_id:
                    host = parts[1]
                    telnet_port = int(parts[2])
                    ingest_port = int(parts[3]) if len(parts) > 3 else self.LIVE_INGEST_PORT
                    return host, telnet_port, ingest_port
        return self.LIQUIDSOAP_TELNET_HOST, self.LIQUIDSOAP_TELNET_PORT, self.LIVE_INGEST_PORT


settings = Settings()
