"""
Goalpost Authentication

Handles user authentication via Databricks identity.
In Databricks Apps, the user identity is passed via headers.
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Annotated
import logging

from .db import get_db, LakebaseClient

logger = logging.getLogger(__name__)

# Security scheme for OpenAPI docs
security = HTTPBearer(auto_error=False)


class User:
    """Represents an authenticated user."""
    
    def __init__(
        self, 
        user_id: str, 
        email: str, 
        display_name: str | None = None
    ):
        self.user_id = user_id
        self.email = email
        self.display_name = display_name or email.split("@")[0]
    
    def __repr__(self):
        return f"User(id={self.user_id}, email={self.email})"


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
    db: LakebaseClient = Depends(get_db)
) -> User:
    """
    Extract and validate the current user from the request.
    
    In Databricks Apps, user identity comes from headers:
    - X-Forwarded-Email: User's email
    - X-Forwarded-User: User's display name
    - X-Forwarded-Access-Token: User's token (optional)
    
    For local development, accepts Bearer token or dev headers.
    """
    
    # Try Databricks App headers first
    email = request.headers.get("X-Forwarded-Email")
    display_name = request.headers.get("X-Forwarded-User")
    
    # Fallback for local development
    if not email:
        email = request.headers.get("X-Dev-Email")
        display_name = request.headers.get("X-Dev-User")
    
    # Still no email? Check for Bearer token (future: validate with Databricks)
    if not email and credentials:
        # In production, validate the token with Databricks
        # For now, just extract email from a simple dev token
        email = "dev@example.com"
        display_name = "Developer"
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # Get or create user in database
    user_id = _get_or_create_user(db, email, display_name)
    
    return User(user_id=user_id, email=email, display_name=display_name)


def _get_or_create_user(
    db: LakebaseClient, 
    email: str, 
    display_name: str | None
) -> str:
    """
    Get existing user or create new one.
    
    Returns the user_id.
    """
    # Check if user exists
    result = db.execute(
        f"SELECT user_id FROM {db.table('users')} WHERE email = :email LIMIT 1",
        {"email": email}
    )
    
    if result:
        return result[0]["user_id"]
    
    # Create new user
    import uuid
    user_id = str(uuid.uuid4())
    
    try:
        db.insert("users", {
            "user_id": user_id,
            "email": email,
            "display_name": display_name or email.split("@")[0]
        })
        logger.info(f"Created new user: {email}")
    except Exception as e:
        # Race condition: user was created by another request
        logger.warning(f"Failed to create user (may already exist): {e}")
        result = db.execute(
            f"SELECT user_id FROM {db.table('users')} WHERE email = :email LIMIT 1",
            {"email": email}
        )
        if result:
            return result[0]["user_id"]
        raise
    
    return user_id


# Type alias for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]

