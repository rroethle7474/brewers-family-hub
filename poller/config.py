"""
config.py — pydantic-settings BaseSettings for the poller.

All configuration comes from environment variables or a .env.local file.
The real SUPABASE_SERVICE_ROLE_KEY must NEVER be committed; load it from
the Supabase dashboard and place it in .env.local (gitignored) locally,
or set it as a Coolify env var in production.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Supabase — service-role key used by the poller only; never exposed to clients.
    supabase_url: str
    supabase_service_role_key: str

    # MLB / polling constants
    brewers_team_id: int = 158
    idle_poll_interval: int = 60    # seconds when no live game
    active_poll_interval: int = 30  # seconds during a live game (SPEC §6 floor)
    wp_swing_threshold: float = 0.15  # 15 percentage points

    # Logging
    log_level: str = "info"


# Module-level singleton — import this everywhere.
settings = Settings()
