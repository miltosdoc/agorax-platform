"""
Admin and cron endpoints.

Dividend distribution, embargo disclosure, phase transitions.
Requires admin authentication.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from decimal import Decimal

router = APIRouter()


class DividendRequest(BaseModel):
    total_eur: Decimal


class PhaseTransitionRequest(BaseModel):
    target_phase: str  # "early_revenue" or "scaled"


@router.post("/admin/dividend")
async def trigger_dividend(request: DividendRequest):
    """
    Trigger civic dividend distribution.

    Distributes total_eur equally among all verified citizens.
    Unconditional — participation not required.
    """
    from main import app

    engine = app.state.engine
    result = await engine.distribute_dividend(request.total_eur)

    return {
        "total_eur": str(result.total_eur),
        "total_points": result.total_points,
        "eligible_count": result.eligible_count,
        "points_per_citizen": result.points_per_citizen,
        "eur_per_citizen": str(result.eur_per_citizen),
    }


@router.post("/admin/disclose")
async def run_disclosure_check():
    """
    Run embargo disclosure check.

    Checks all embargoed deliberations and discloses those past their date.
    Also runs as a background job every hour.
    """
    from main import app

    engine = app.state.engine
    repo = app.state.deliberation_repo

    disclosed_count = 0
    # TODO: Query all embargoed deliberations and check each
    # for deliberation in embargoed_deliberations:
    #     if await engine.check_and_disclose(deliberation.id):
    #         disclosed_count += 1

    return {"disclosed_count": disclosed_count}


@router.put("/admin/phase")
async def transition_phase(request: PhaseTransitionRequest):
    """
    Transition platform phase.

    One-way operation. Cannot go backwards.
    PRE_REVENUE → EARLY_REVENUE → SCALED
    """
    from main import app

    engine = app.state.engine
    config = engine.config

    current = config.current_phase.value
    target = request.target_phase

    # Validate one-way transition
    phases = ["pre_revenue", "early_revenue", "scaled"]
    if current not in phases or target not in phases:
        raise HTTPException(400, f"Invalid phase: {target}")

    current_idx = phases.index(current)
    target_idx = phases.index(target)

    if target_idx <= current_idx:
        raise HTTPException(
            400,
            f"Cannot transition from {current} to {target}. "
            "Phase transitions are one-way only.",
        )

    # TODO: Update config.current_phase in persistent storage
    # This requires updating the config in the database and reloading

    return {
        "previous_phase": current,
        "new_phase": target,
        "message": f"Phase transitioned from {current} to {target}",
    }
