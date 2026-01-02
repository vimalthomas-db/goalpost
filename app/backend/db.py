"""
Goalpost Database Layer

Provides a thin wrapper around Databricks SQL for Lakebase queries.
Optimized for low-latency CRUD operations.
"""

from contextlib import contextmanager
from typing import Any
import logging

from databricks import sql
from databricks.sdk import WorkspaceClient

from .config import get_settings

logger = logging.getLogger(__name__)


class LakebaseClient:
    """
    Client for executing SQL against Lakebase tables.
    
    Uses the Databricks SQL Connector for <5ms point queries.
    Falls back to SDK Statement Execution API if needed.
    """
    
    def __init__(self):
        self.settings = get_settings()
        self._workspace_client = None
    
    @property
    def workspace_client(self) -> WorkspaceClient:
        """Lazy-loaded Databricks workspace client."""
        if self._workspace_client is None:
            # In Databricks Apps, auth is automatic via app identity
            self._workspace_client = WorkspaceClient(
                host=self.settings.databricks_host or None,
                token=self.settings.databricks_token or None
            )
        return self._workspace_client
    
    @contextmanager
    def connection(self):
        """
        Context manager for SQL connections.
        
        Usage:
            with db.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM table")
        """
        import os
        from databricks.sdk.core import Config, oauth_service_principal
        
        host = self.settings.databricks_host
        if host:
            host = host.replace("https://", "").replace("http://", "")
        
        http_path = f"/sql/1.0/warehouses/{self.settings.warehouse_id}"
        
        # Check if we have an explicit token
        token = self.settings.databricks_token
        if not token:
            token = os.environ.get("DATABRICKS_TOKEN")
        
        if token:
            # Use token auth
            conn = sql.connect(
                server_hostname=host,
                http_path=http_path,
                access_token=token
            )
        else:
            # Use SDK credential provider (works in Databricks Apps)
            try:
                cfg = Config()
                def credential_provider():
                    return cfg.authenticate
                
                conn = sql.connect(
                    server_hostname=host or cfg.host.replace("https://", ""),
                    http_path=http_path,
                    credentials_provider=credential_provider
                )
            except Exception as e:
                logger.error(f"Failed to create connection with credential provider: {e}")
                raise Exception(f"Database connection failed: {e}")
        
        try:
            yield conn
        finally:
            conn.close()
    
    def execute(
        self, 
        query: str, 
        params: dict[str, Any] | None = None,
        fetch: bool = True
    ) -> list[dict]:
        """
        Execute a SQL query and return results as list of dicts.
        
        Args:
            query: SQL query with :param_name placeholders
            params: Dictionary of parameter values
            fetch: Whether to fetch results (False for INSERT/UPDATE/DELETE)
        
        Returns:
            List of row dictionaries, or empty list for non-SELECT queries
        
        Example:
            results = db.execute(
                "SELECT * FROM tasks WHERE user_id = :user_id",
                {"user_id": "abc123"}
            )
        """
        with self.connection() as conn:
            cursor = conn.cursor()
            try:
                # Convert :param to %(param)s for Python DB-API
                formatted_query = query
                formatted_params = params
                
                if params:
                    for key in params.keys():
                        formatted_query = formatted_query.replace(
                            f":{key}", f"%({key})s"
                        )
                
                logger.debug(f"Executing: {formatted_query[:200]}...")
                cursor.execute(formatted_query, formatted_params)
                
                if fetch:
                    columns = [desc[0] for desc in cursor.description or []]
                    rows = cursor.fetchall()
                    return [dict(zip(columns, row)) for row in rows]
                else:
                    return []
                    
            except Exception as e:
                logger.error(f"Query failed: {e}")
                logger.error(f"Query was: {formatted_query[:500]}")
                raise Exception(f"Database error: {str(e)}")
            finally:
                cursor.close()
    
    def execute_many(
        self, 
        query: str, 
        params_list: list[dict[str, Any]]
    ) -> int:
        """
        Execute a query multiple times with different parameters.
        
        Useful for batch inserts.
        
        Returns:
            Number of rows affected
        """
        with self.connection() as conn:
            cursor = conn.cursor()
            try:
                count = 0
                for params in params_list:
                    formatted_query = query
                    for key in params.keys():
                        formatted_query = formatted_query.replace(
                            f":{key}", f"%({key})s"
                        )
                    cursor.execute(formatted_query, params)
                    count += 1
                return count
            finally:
                cursor.close()
    
    def table(self, name: str) -> str:
        """Get fully qualified table name."""
        return self.settings.table(name)
    
    # Convenience methods for common operations
    
    def get_by_id(self, table: str, id_column: str, id_value: str) -> dict | None:
        """Fetch a single row by ID."""
        results = self.execute(
            f"SELECT * FROM {self.table(table)} WHERE {id_column} = :id LIMIT 1",
            {"id": id_value}
        )
        return results[0] if results else None
    
    def insert(self, table: str, data: dict[str, Any]) -> None:
        """Insert a single row."""
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())
        self.execute(
            f"INSERT INTO {self.table(table)} ({columns}) VALUES ({placeholders})",
            data,
            fetch=False
        )
    
    def update(
        self, 
        table: str, 
        id_column: str, 
        id_value: str, 
        data: dict[str, Any]
    ) -> None:
        """Update a single row by ID."""
        set_clause = ", ".join(f"{k} = :{k}" for k in data.keys())
        params = {**data, "id": id_value}
        self.execute(
            f"UPDATE {self.table(table)} SET {set_clause}, updated_at = CURRENT_TIMESTAMP() WHERE {id_column} = :id",
            params,
            fetch=False
        )
    
    def delete(self, table: str, id_column: str, id_value: str) -> None:
        """Delete a single row by ID."""
        self.execute(
            f"DELETE FROM {self.table(table)} WHERE {id_column} = :id",
            {"id": id_value},
            fetch=False
        )


# Global instance
db = LakebaseClient()


def get_db() -> LakebaseClient:
    """Dependency injection for FastAPI."""
    return db

