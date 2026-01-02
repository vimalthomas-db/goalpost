"""
Goalpost API Routers

FastAPI routers for different resource types.
"""

from .goals import router as goals_router
from .tasks import router as tasks_router
from .dashboard import router as dashboard_router

__all__ = ["goals_router", "tasks_router", "dashboard_router"]

