"""
Dashboard Router

Endpoints for dashboard views and aggregated data.
"""

from fastapi import APIRouter, Depends, Query
from typing import Annotated
from datetime import date, timedelta

from ..auth import CurrentUser
from ..db import get_db, LakebaseClient
from ..models import (
    DashboardResponse, DashboardStats, WeekSummary,
    TaskResponse, GoalResponse
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def get_current_week_start() -> date:
    """Get the Monday of the current week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Get the main dashboard data.
    
    Returns:
    - Overall stats
    - Current week tasks
    - Next week tasks
    - Overdue tasks
    - Recent/active goals
    """
    user_id = user.user_id
    week_start = get_current_week_start()
    next_week_start = week_start + timedelta(days=7)
    
    # Overall stats
    stats_result = db.execute(
        f"""
        SELECT
            (SELECT COUNT(*) FROM {db.table('goals')} WHERE user_id = :user_id) AS total_goals,
            (SELECT COUNT(*) FROM {db.table('goals')} WHERE user_id = :user_id AND status = 'ACTIVE') AS active_goals,
            (SELECT COUNT(*) FROM {db.table('tasks')} WHERE user_id = :user_id AND status NOT IN ('CANCELLED', 'ROLLED_OVER')) AS total_tasks,
            (SELECT COUNT(*) FROM {db.table('tasks')} WHERE user_id = :user_id AND status = 'DONE') AS completed_tasks,
            (SELECT COUNT(*) FROM {db.table('tasks')} WHERE user_id = :user_id AND week_end < CURRENT_DATE() AND status NOT IN ('DONE', 'CANCELLED', 'ROLLED_OVER')) AS overdue_tasks
        """,
        {"user_id": user_id}
    )
    
    stats_row = stats_result[0] if stats_result else {}
    total = stats_row.get("total_tasks", 0)
    completed = stats_row.get("completed_tasks", 0)
    
    stats = DashboardStats(
        total_goals=stats_row.get("total_goals", 0),
        active_goals=stats_row.get("active_goals", 0),
        total_tasks=total,
        completed_tasks=completed,
        overdue_tasks=stats_row.get("overdue_tasks", 0),
        completion_percent=round(completed * 100.0 / total, 1) if total > 0 else 0.0
    )
    
    # Current week tasks - use date range to catch tasks within the week
    current_week_end = week_start + timedelta(days=6)
    current_week = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
          AND t.week_start >= :week_start
          AND t.week_start <= :week_end
          AND t.status NOT IN ('CANCELLED', 'ROLLED_OVER')
        ORDER BY t.priority, t.sort_order
        """,
        {"user_id": user_id, "week_start": week_start.isoformat(), "week_end": current_week_end.isoformat()}
    )
    
    # Upcoming week tasks
    next_week_end = next_week_start + timedelta(days=6)
    upcoming_week = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
          AND t.week_start >= :week_start
          AND t.week_start <= :week_end
          AND t.status NOT IN ('CANCELLED', 'ROLLED_OVER')
        ORDER BY t.priority, t.sort_order
        """,
        {"user_id": user_id, "week_start": next_week_start.isoformat(), "week_end": next_week_end.isoformat()}
    )
    
    # Overdue tasks
    overdue = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
          AND t.week_end < CURRENT_DATE()
          AND t.status NOT IN ('DONE', 'CANCELLED', 'ROLLED_OVER')
        ORDER BY t.week_end DESC
        LIMIT 20
        """,
        {"user_id": user_id}
    )
    
    # Recent active goals
    recent_goals = db.execute(
        f"""
        SELECT 
            g.*,
            ROUND(g.current_count * 100.0 / NULLIF(g.target_count, 0), 1) AS progress_percent
        FROM {db.table('goals')} g
        WHERE g.user_id = :user_id AND g.status = 'ACTIVE'
        ORDER BY g.updated_at DESC NULLS LAST
        LIMIT 5
        """,
        {"user_id": user_id}
    )
    
    return DashboardResponse(
        stats=stats,
        current_week=current_week,
        upcoming_week=upcoming_week,
        overdue=overdue,
        recent_goals=recent_goals
    )


@router.get("/weekly-summary", response_model=list[WeekSummary])
async def get_weekly_summary(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    weeks: int = Query(12, ge=1, le=52, description="Number of weeks to include")
):
    """
    Get weekly summary statistics.
    
    Returns completion stats for the past N weeks.
    """
    # Calculate start date (N weeks ago)
    today = date.today()
    start = today - timedelta(weeks=weeks)
    
    results = db.execute(
        f"""
        SELECT 
            year_week,
            MIN(week_start) AS week_start,
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_tasks,
            SUM(target_count) AS total_target,
            SUM(completed_count) AS total_completed,
            ROUND(SUM(completed_count) * 100.0 / NULLIF(SUM(target_count), 0), 1) AS completion_percent
        FROM {db.table('tasks')}
        WHERE user_id = :user_id
          AND week_start >= :start_date
          AND status NOT IN ('CANCELLED', 'ROLLED_OVER')
        GROUP BY year_week
        ORDER BY year_week DESC
        """,
        {"user_id": user.user_id, "start_date": start.isoformat()}
    )
    
    return results


@router.get("/overdue", response_model=list[TaskResponse])
async def get_overdue_tasks(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200)
):
    """
    Get all overdue tasks.
    
    Returns tasks where week_end is in the past and status is not DONE/CANCELLED.
    """
    results = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color,
            DATEDIFF(CURRENT_DATE(), t.week_end) AS days_overdue
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
          AND t.week_end < CURRENT_DATE()
          AND t.status NOT IN ('DONE', 'CANCELLED', 'ROLLED_OVER')
        ORDER BY t.week_end ASC
        LIMIT :limit
        """,
        {"user_id": user.user_id, "limit": limit}
    )
    
    return results


@router.get("/calendar")
async def get_calendar_view(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    start_date: date = Query(..., description="Start date for calendar view"),
    end_date: date = Query(..., description="End date for calendar view")
):
    """
    Get tasks grouped by week for a calendar view.
    
    Returns a dict with week_start dates as keys.
    """
    results = db.execute(
        f"""
        SELECT 
            t.week_start,
            t.week_end,
            t.year_week,
            COUNT(*) AS task_count,
            SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END) AS completed_count,
            SUM(t.target_count) AS total_target,
            SUM(t.completed_count) AS total_completed
        FROM {db.table('tasks')} t
        WHERE t.user_id = :user_id
          AND t.week_start >= :start_date
          AND t.week_end <= :end_date
          AND t.status NOT IN ('CANCELLED', 'ROLLED_OVER')
        GROUP BY t.week_start, t.week_end, t.year_week
        ORDER BY t.week_start
        """,
        {
            "user_id": user.user_id,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }
    )
    
    return {"weeks": results}

