"""
Rebalance Router

Endpoints for task rebalancing with current week and future week hour budgets.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Annotated
import asyncio

from ..auth import CurrentUser
from ..agents.rebalance_agent import calculate_rebalance, apply_rebalance

router = APIRouter(prefix="/rebalance", tags=["Rebalance"])


class RebalanceRequest(BaseModel):
    """Request model for calculating a rebalance plan."""
    current_week_hours: float = Field(..., ge=0, le=168, description="Hours available THIS week")
    future_week_hours: float = Field(..., gt=0, le=168, description="Hours available for future weeks")
    use_ai: bool = Field(default=True, description="Use AI for smart recommendations")


class RebalancePlan(BaseModel):
    """Response model for a rebalance plan."""
    success: bool
    message: str
    recommendations: list[str] = []
    changes: list[dict]
    summary: dict


class ApplyRequest(BaseModel):
    """Request model for applying changes."""
    changes: list[dict]


class ApplyResponse(BaseModel):
    """Response model for applied changes."""
    success: bool
    applied: list[dict]
    errors: list[dict]
    total_applied: int
    total_errors: int


@router.post("/calculate", response_model=RebalancePlan)
async def calculate_plan(
    request: RebalanceRequest,
    user: CurrentUser
):
    """
    Calculate a smart rebalance plan based on available time.
    
    - current_week_hours: How many hours available THIS week (0 = push all tasks)
    - future_week_hours: Regular weekly budget for future weeks
    """
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: calculate_rebalance(
                user_id=user.user_id,
                current_week_hours=request.current_week_hours,
                future_week_hours=request.future_week_hours,
                use_ai=request.use_ai
            )
        )
        return RebalancePlan(**plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rebalance calculation failed: {str(e)}")


@router.post("/apply", response_model=ApplyResponse)
async def apply_plan(
    request: ApplyRequest,
    user: CurrentUser
):
    """Apply a rebalance plan."""
    try:
        result = apply_rebalance(
            user_id=user.user_id,
            changes=request.changes
        )
        return ApplyResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply failed: {str(e)}")
