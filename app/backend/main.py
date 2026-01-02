"""
Goalpost API

FastAPI application for goal tracking with weekly task dissection.
Powered by Databricks Delta Lake.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import logging
import time

from .config import get_settings
from .routers import goals_router, tasks_router, dashboard_router
from .routers.rebalance import router as rebalance_router

# Static files directory - try multiple possible locations
def find_frontend_dir():
    """Find the frontend dist directory."""
    possible_paths = [
        Path(__file__).parent.parent / "frontend" / "dist",  # Local dev
        Path("/app/python/source_code/frontend/dist"),       # Databricks App
        Path(__file__).parent.parent.parent / "frontend" / "dist",
    ]
    for p in possible_paths:
        if p.exists() and (p / "index.html").exists():
            return p
    return possible_paths[0]  # Fallback

FRONTEND_DIR = find_frontend_dir()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("goalpost")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    settings = get_settings()
    logger.info(f"Starting Goalpost API")
    logger.info(f"Catalog: {settings.catalog_name}, Schema: {settings.schema_name}")
    logger.info(f"Frontend dir: {FRONTEND_DIR}, exists: {FRONTEND_DIR.exists()}")
    if FRONTEND_DIR.exists():
        logger.info(f"Frontend files: {list(FRONTEND_DIR.iterdir())[:5]}")
    yield
    logger.info("Shutting down Goalpost API")


# Create FastAPI app
app = FastAPI(
    title="Goalpost API",
    description="""
    **Goalpost** transforms yearly goals into actionable weekly tasks.
    
    ## Features
    
    - **Goals**: Create, update, delete goals with target counts and deadlines
    - **Tasks**: Auto-generated weekly tasks with progress tracking
    - **Dashboard**: Overview of current week, overdue items, and stats
    
    ## Architecture
    
    - Backend: FastAPI running as a Databricks App
    - Database: Databricks Lakebase (low-latency Delta tables)
    - Auth: Databricks identity (SSO)
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request timing middleware
@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Response-Time"] = f"{elapsed*1000:.2f}ms"
    return response


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "detail": "Internal server error"}
    )


# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "goalpost"}


# API info endpoint
@app.get("/api", tags=["System"])
async def api_info():
    """Get API information."""
    return {
        "name": "Goalpost API",
        "version": "1.0.0",
        "docs": "/api/docs"
    }


# Mount routers
app.include_router(goals_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(rebalance_router, prefix="/api")

# Serve static frontend files
if FRONTEND_DIR.exists():
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    
    # Serve index.html for all non-API routes (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA for all non-API routes."""
        # Don't serve index.html for API routes
        if full_path.startswith("api/") or full_path == "health":
            return JSONResponse({"error": "Not found"}, status_code=404)
        
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return JSONResponse({"error": "Frontend not found"}, status_code=404)


# Development server entry point
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

