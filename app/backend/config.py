"""
Goalpost Configuration

Loads settings from environment variables.
In Databricks Apps, these are set via app.yaml or workspace secrets.

REQUIRED ENVIRONMENT VARIABLES (set in app.yaml):
- CATALOG_NAME: Unity Catalog name (e.g., "goalpost_catalog")
- SCHEMA_NAME: Schema name (e.g., "prod")
- WAREHOUSE_ID: SQL Warehouse ID for queries
- LLM_ENDPOINT: Model serving endpoint for AI features (optional)
"""

import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Databricks connection (auto-detected in Databricks Apps)
    # No need to set - WorkspaceClient auto-detects when running in Databricks
    databricks_host: str = ""
    databricks_token: str = ""
    
    # Unity Catalog - MUST BE SET for each workspace
    catalog_name: str = os.getenv("CATALOG_NAME", "goalpost_catalog")
    schema_name: str = os.getenv("SCHEMA_NAME", "prod")
    
    # SQL Warehouse - MUST BE SET for each workspace
    warehouse_id: str = os.getenv("WAREHOUSE_ID", "")
    
    # LLM Endpoint - Optional, for AI features
    llm_endpoint: str = os.getenv("LLM_ENDPOINT", "")
    
    # App settings
    app_name: str = "Goalpost"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # CORS (for local development)
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000", "*"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_prefix = ""
        case_sensitive = False
    
    @property
    def full_schema_path(self) -> str:
        """Returns fully qualified schema path: catalog.schema"""
        return f"{self.catalog_name}.{self.schema_name}"
    
    def table(self, name: str) -> str:
        """Returns fully qualified table name: catalog.schema.table"""
        return f"{self.catalog_name}.{self.schema_name}.{name}"
    
    def validate_required(self) -> list[str]:
        """Check if required settings are configured."""
        errors = []
        if not self.catalog_name:
            errors.append("CATALOG_NAME is not set")
        if not self.schema_name:
            errors.append("SCHEMA_NAME is not set")
        if not self.warehouse_id:
            errors.append("WAREHOUSE_ID is not set")
        return errors


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
