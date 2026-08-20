"""
Configuration management for the Economy Service.
Load settings from environment variables with sensible defaults.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from decimal import Decimal


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # Ignore env vars from shared .env not used by this service
    )

    # Database — shared PostgreSQL with main API and ballot_service
    DATABASE_URL: str = "postgresql://agorax:***@db:5432/agorax"

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # BTCPay Server
    BTCPAY_SERVER_URL: str = ""
    BTCPAY_API_KEY: str = ""

    # Exchange rate provider
    COINGECKO_API_URL: str = "https://api.coingecko.com/api/v3"

    # Admin
    ADMIN_SECRET: str = ""

    # Application settings
    DEBUG: bool = False
    API_PREFIX: str = "/api"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    # Economy config overrides (optional — defaults from EconomyConfig)
    CITIZEN_SHARE: str = "0.70"
    OPERATIONS_SHARE: str = "0.30"
    POINTS_PER_EUR: int = 100
    CURRENT_PHASE: str = "pre_revenue"


# Singleton settings instance
settings = Settings()
