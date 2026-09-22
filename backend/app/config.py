from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, sourced entirely from environment variables.

    Instantiating this class is what makes the app fail fast on missing or
    invalid required config (see get_settings()).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr = Field(alias="DATABASE_URL")
    port: int = Field(default=8000, alias="PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    db_pool_size: int = Field(default=5, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=5, alias="DB_MAX_OVERFLOW")
    db_statement_timeout_ms: int = Field(default=5000, alias="DB_STATEMENT_TIMEOUT_MS")
    readiness_db_timeout_seconds: float = Field(default=1.0, alias="READINESS_DB_TIMEOUT_SECONDS")
    cors_allowed_origins: str = Field(default="", alias="CORS_ALLOWED_ORIGINS")
    app_version: str = Field(default="dev", alias="APP_VERSION")
    git_sha: str = Field(default="unknown", alias="GIT_SHA")
    db_ssl: Literal["disable", "require", "verify-full"] = Field(default="disable", alias="DB_SSL")
    db_ssl_root_cert: str = Field(default="", alias="DB_SSL_ROOT_CERT")

    @model_validator(mode="after")
    def _verify_full_requires_root_cert(self) -> "Settings":
        if self.db_ssl == "verify-full" and not self.db_ssl_root_cert:
            raise ValueError("DB_SSL_ROOT_CERT is required when DB_SSL=verify-full")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
