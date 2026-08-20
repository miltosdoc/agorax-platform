"""
Public API endpoints — no authentication required.

Transparency report, sortition verification, public deliberation results,
platform statistics.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from decimal import Decimal
from typing import Optional

from agorax_economy.sortition import verify_selection

router = APIRouter()


class SortitionVerifyRequest(BaseModel):
    seed_hex: str
    proof_hex: str
    deliberation_id: str
    pool_size: int
    panel_size: int


class SortitionVerifyResponse(BaseModel):
    is_valid: bool
    selected_indices: list[int]


@router.get("/transparency")
async def get_transparency_report():
    """
    Public treasury transparency report.

    Anyone can see where every euro went. Constitutional to the platform.
    """
    from main import app

    engine = app.state.engine
    report = await engine.get_public_stats()
    return report


@router.post("/deliberations/{deliberation_id}/verify")
async def verify_sortition(
    deliberation_id: str,
    request: SortitionVerifyRequest,
):
    """
    Verify sortition fairness.

    Anyone can call this with the published seed and proof to confirm
    the panel was fairly chosen.
    """
    is_valid, indices = verify_selection(
        seed_hex=request.seed_hex,
        proof_hex=request.proof_hex,
        deliberation_id=request.deliberation_id,
        pool_size=request.pool_size,
        panel_size=request.panel_size,
    )

    return SortitionVerifyResponse(
        is_valid=is_valid,
        selected_indices=indices,
    )


@router.get("/deliberations/public")
async def get_public_deliberations():
    """
    All publicly disclosed deliberation results.

    Returns deliberations with visibility=PUBLIC or status=DISCLOSED.
    """
    from main import app

    repo = app.state.deliberation_repo
    # TODO: Query public deliberations from the repository
    return {"deliberations": [], "count": 0}


@router.get("/stats")
async def get_platform_stats():
    """
    Platform-wide statistics.

    Total citizens, deliberations, total paid to citizens.
    """
    from main import app

    engine = app.state.engine
    report = await engine.get_public_stats()

    return {
        **report,
        "total_citizens": 0,  # TODO: query from citizens table
        "total_deliberations": 0,  # TODO: query from deliberations table
    }
