"""
AgoraX Economy Service — FastAPI Application

Wraps the agorax_economy module with SQLAlchemy repositories,
API routes, and background jobs.

Port: 8001 (ballot_service uses 8000)
"""

import sys
import os

# Ensure sibling agorax_economy module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import get_db, init_db
from repositories import PointsRepo, TreasuryRepo, DeliberationRepo
from agorax_economy import (
    DEFAULT_CONFIG,
    EconomyEngine,
    PointsManager,
    TreasuryManager,
    PaymentGateway,
    StripeAdapter,
)
from routes.client import router as client_router
from routes.citizen import router as citizen_router
from routes.public import router as public_router
from routes.admin import router as admin_router
from jobs import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup → run → shutdown."""
    # Initialize database
    init_db()

    # Build engine components
    points_repo = PointsRepo()
    treasury_repo = TreasuryRepo()
    deliberation_repo = DeliberationRepo()

    config = DEFAULT_CONFIG

    points_mgr = PointsManager(config, points_repo)
    treasury_mgr = TreasuryManager(config, treasury_repo)
    payments = PaymentGateway()

    # Register Stripe adapter if configured
    if settings.STRIPE_SECRET_KEY:
        payments.register_adapter(StripeAdapter(api_key=settings.STRIPE_SECRET_KEY))

    engine = EconomyEngine(
        config=config,
        treasury=treasury_mgr,
        points=points_mgr,
        payments=payments,
        deliberation_repo=deliberation_repo,
    )

    # Store in app state for route access
    app.state.engine = engine
    app.state.points_repo = points_repo
    app.state.treasury_repo = treasury_repo
    app.state.deliberation_repo = deliberation_repo

    # Start background jobs
    start_scheduler(app)

    yield

    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="AgoraX Economy Service",
    description="Non-profit economic engine for democratic deliberation. "
                "70% to citizens, 30% to operations, 0% profit.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow main API to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(client_router, prefix="/api")
app.include_router(citizen_router, prefix="/api")
app.include_router(public_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "economy",
        "version": "0.1.0",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.DEBUG,
    )
