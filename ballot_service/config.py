"""
Configuration management for the Ballot Validation Service.
Load settings from environment variables with sensible defaults.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Security — SALT_KEY is the server-side secret used to hash AFMs and
    # Gov.gr document codes. No default: missing env var must fail startup
    # so a misconfigured deployment can never share a known/default salt
    # across environments (GDPR pseudonymisation: brief §4.2).
    SALT_KEY: str = Field(..., min_length=16)

    # Database — defaults to PostgreSQL (shared with main API)
    DATABASE_URL: str = "postgresql://agorax:changeme@db:5432/agorax"
    
    # Allowed government signers for PAdES validation
    # These are the CN (Common Name) values from the signing certificates
    ALLOWED_SIGNERS: List[str] = [
        "Hellenic Republic",
        "HELLENIC REPUBLIC", 
        "Ministry of Digital Governance",
        "MINISTRY OF DIGITAL GOVERNANCE",
        "Ελληνική Δημοκρατία",
        "Υπουργείο Ψηφιακής Διακυβέρνησης",
        "APOSTILLE",  # Gov.gr signing service
        "gov.gr",
        "government",
    ]
    
    # Application settings
    DEBUG: bool = False
    API_PREFIX: str = "/api/ballot"
    
    # Vote update policy
    ALLOW_VOTE_UPDATE: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000


# Singleton settings instance
settings = Settings()
