from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "hackathon-backend"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


@lru_cache
def get_settings() -> Settings:
    return Settings()
