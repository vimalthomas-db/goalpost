"""
Goals Router

CRUD endpoints for goal management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Annotated
from datetime import datetime
import uuid

from ..auth import CurrentUser
from ..db import get_db, LakebaseClient
from ..models import (
    GoalCreate, GoalUpdate, GoalResponse, GoalWithTasks,
    SuccessResponse, CreatedResponse
)
from ..services.dissect import weeks_between
from ..agents.dissect_agent import dissect_goal

router = APIRouter(prefix="/goals", tags=["Goals"])

# Distinct color palette for auto-assignment
GOAL_COLORS = [
    "#22c55e",  # green
    "#3b82f6",  # blue
    "#f59e0b",  # amber
    "#ef4444",  # red
    "#8b5cf6",  # purple
    "#ec4899",  # pink
    "#06b6d4",  # cyan
    "#f97316",  # orange
    "#14b8a6",  # teal
    "#6366f1",  # indigo
    "#84cc16",  # lime
    "#d946ef",  # fuchsia
    "#eab308",  # yellow
    "#0ea5e9",  # sky
    "#a855f7",  # violet
    "#10b981",  # emerald
]

def get_next_color(db: LakebaseClient, user_id: str) -> str:
    """Get the next available distinct color for a new goal."""
    try:
        # Count user's existing goals
        result = db.execute(
            f"SELECT COUNT(*) as count FROM {db.table('goals')} WHERE user_id = :user_id",
            {"user_id": user_id}
        )
        count = 0
        if result and len(result) > 0:
            raw_count = result[0].get("count", 0)
            count = int(raw_count) if raw_count is not None else 0
        # Cycle through colors
        return GOAL_COLORS[count % len(GOAL_COLORS)]
    except Exception:
        # Default to first color if anything fails
        return GOAL_COLORS[0]


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    List all goals for the current user.
    
    - **status**: Filter by goal status (ACTIVE, COMPLETED, PAUSED, ARCHIVED)
    - **limit**: Maximum number of results (default 50)
    - **offset**: Pagination offset
    """
    try:
        query = f"""
            SELECT 
                g.*,
                COALESCE(ROUND(COALESCE(g.current_count, 0) * 100.0 / NULLIF(g.target_count, 0), 1), 0) AS progress_percent
            FROM {db.table('goals')} g
            WHERE g.user_id = :user_id
        """
        params = {"user_id": user.user_id, "limit": limit, "offset": offset}
        
        if status_filter:
            query += " AND g.status = :status"
            params["status"] = status_filter.upper()
        
        query += " ORDER BY g.priority ASC, g.created_at DESC LIMIT :limit OFFSET :offset"
        
        results = db.execute(query, params)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load goals: {str(e)}")


from pydantic import BaseModel
from datetime import date as date_type
from typing import Any
import logging

logger = logging.getLogger(__name__)

class GoalPlanRequest(BaseModel):
    title: str
    description: str | None = None
    start_date: date_type
    end_date: date_type
    weekly_hours: int = 5
    experience_level: str = "intermediate"

class GoalPlanTask(BaseModel):
    title: str
    description: str
    estimated_hours: float
    week_number: int
    week_start: str
    week_end: str
    type: str = "practice"

class GoalPlanResponse(BaseModel):
    analysis: dict[str, Any]
    tasks: list[dict[str, Any]]
    summary: dict[str, Any]
    weekly_summary: dict[str, Any]
    overloaded_weeks: list[dict[str, Any]]
    warnings: list[str]


@router.post("/plan", response_model=GoalPlanResponse)
async def preview_goal_plan(
    request: GoalPlanRequest,
    user: CurrentUser
):
    """
    Generate a SPECIFIC, TAILORED execution plan for a goal.
    
    Uses the Goal Dissection Agent to:
    1. Analyze the goal and understand what it takes to achieve it
    2. Create specific, actionable tasks (not generic)
    3. Distribute tasks across weeks based on available time
    4. Identify any overloaded weeks
    """
    try:
        plan = dissect_goal(
            title=request.title,
            description=request.description or "",
            start_date=request.start_date,
            end_date=request.end_date,
            weekly_hours=request.weekly_hours,
            experience_level=request.experience_level
        )
        return GoalPlanResponse(**plan)
    except Exception as e:
        logger.error(f"Plan generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate plan: {str(e)}")


@router.post("", response_model=CreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    goal: GoalCreate,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Create a new goal and auto-generate weekly tasks using Llama 4.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        goal_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        # Auto-assign a distinct color
        goal_color = get_next_color(db, user.user_id)
        
        # Use dissect_goal agent to generate tasks
        plan = dissect_goal(
            title=goal.title,
            description=goal.description or "",
            start_date=goal.start_date,
            end_date=goal.end_date,
            weekly_hours=goal.weekly_hours if hasattr(goal, 'weekly_hours') else 5,
            experience_level=goal.experience_level if hasattr(goal, 'experience_level') else "intermediate"
        )
        
        # Get task count from plan
        target_count = plan["summary"]["total_tasks"]
        
        # Build INSERT with proper array syntax for tags
        tags_sql = "NULL"
        if goal.tags:
            escaped_tags = ", ".join([f"'{t}'" for t in goal.tags])
            tags_sql = f"ARRAY({escaped_tags})"
        
        # Insert goal
        query = f"""
            INSERT INTO {db.table('goals')} 
            (goal_id, user_id, title, description, target_count, current_count, 
             start_date, end_date, priority, status, color, tags, created_at, updated_at)
            VALUES (
                :goal_id, :user_id, :title, :description, :target_count, 0,
                :start_date, :end_date, :priority, 'ACTIVE', :color, 
                {tags_sql}, :created_at, :updated_at
            )
        """
        db.execute(query, {
            "goal_id": goal_id,
            "user_id": user.user_id,
            "title": goal.title,
            "description": goal.description or "",
            "target_count": target_count,
            "start_date": goal.start_date.isoformat(),
            "end_date": goal.end_date.isoformat(),
            "priority": goal.priority,
            "color": goal_color,
            "created_at": now,
            "updated_at": now
        }, fetch=False)
        
        # Insert tasks from the plan
        tasks = plan.get("tasks", [])
        if tasks:
            values_list = []
            for i, task in enumerate(tasks):
                task_id = str(uuid.uuid4())
                title_escaped = task["title"].replace("'", "''")
                desc_escaped = task.get("description", "").replace("'", "''")
                year_week = task.get("year_week", task["week_start"][:4] + "-W" + str(task["week_number"]).zfill(2))
                
                values_list.append(f"""(
                    '{task_id}', '{goal_id}', NULL,
                    '{user.user_id}', '{title_escaped}', '{desc_escaped}',
                    '{task["week_start"]}', '{task["week_end"]}', '{year_week}',
                    {task.get("estimated_hours", 1)}, 0, 'NEW', {goal.priority}, {i},
                    NULL, NULL, '{now}', '{now}', NULL, NULL
                )""")
            
            batch_query = f"""
                INSERT INTO {db.table('tasks')} 
                (task_id, goal_id, milestone_id, user_id, title, description,
                 week_start, week_end, year_week, target_count, completed_count, 
                 status, priority, sort_order, assignee, notes, created_at, updated_at, 
                 completed_at, rolled_over_from)
                VALUES {', '.join(values_list)}
            """
            db.execute(batch_query, fetch=False)
        
        msg = f"Goal created with {len(tasks)} AI-planned tasks"
        
        return CreatedResponse(
            id=goal_id,
            message=msg
        )
    except Exception as e:
        logger.error(f"Failed to create goal: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create goal: {str(e)}")


@router.get("/{goal_id}", response_model=GoalWithTasks)
async def get_goal(
    goal_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Get a specific goal with all its tasks.
    """
    # Get goal
    goal = db.execute(
        f"""
        SELECT 
            g.*,
            ROUND(g.current_count * 100.0 / NULLIF(g.target_count, 0), 1) AS progress_percent
        FROM {db.table('goals')} g
        WHERE g.goal_id = :goal_id AND g.user_id = :user_id
        """,
        {"goal_id": goal_id, "user_id": user.user_id}
    )
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    goal_data = goal[0]
    
    # Get milestones
    milestones = db.execute(
        f"""
        SELECT * FROM {db.table('milestones')}
        WHERE goal_id = :goal_id
        ORDER BY sort_order
        """,
        {"goal_id": goal_id}
    )
    
    # Get tasks
    tasks = db.execute(
        f"""
        SELECT * FROM {db.table('tasks')}
        WHERE goal_id = :goal_id
        ORDER BY week_start, sort_order
        """,
        {"goal_id": goal_id}
    )
    
    # Calculate milestone progress
    for m in milestones:
        milestone_tasks = [t for t in tasks if t.get("milestone_id") == m["milestone_id"]]
        m["total_tasks"] = len(milestone_tasks)
        m["completed_tasks"] = sum(1 for t in milestone_tasks if t.get("status") == "DONE")
        m["progress_percent"] = round(
            m["completed_tasks"] * 100.0 / max(m["total_tasks"], 1), 1
        )
    
    # Count completed tasks
    completed = sum(1 for t in tasks if t.get("status") == "DONE")
    
    return {
        **goal_data,
        "milestones": milestones,
        "tasks": tasks,
        "total_tasks": len(tasks),
        "completed_tasks": completed
    }


@router.patch("/{goal_id}", response_model=SuccessResponse)
async def update_goal(
    goal_id: str,
    updates: GoalUpdate,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Update a goal.
    
    Only provided fields will be updated.
    """
    # Verify ownership
    existing = db.execute(
        f"SELECT goal_id FROM {db.table('goals')} WHERE goal_id = :id AND user_id = :user_id",
        {"id": goal_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Build update dict from non-None fields
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Handle status -> completed_at
    if updates.status and updates.status.value == "COMPLETED":
        update_data["completed_at"] = "CURRENT_TIMESTAMP()"
    
    db.update("goals", "goal_id", goal_id, update_data)
    
    return SuccessResponse(message="Goal updated")


@router.delete("/all", response_model=SuccessResponse)
async def delete_all_goals(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    confirm: bool = Query(..., description="Must be true to confirm deletion")
):
    """
    Delete ALL goals and tasks for the current user (Clean Slate).
    
    This action is IRREVERSIBLE. All goals, tasks, and milestones will be permanently deleted.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="Must confirm deletion with confirm=true")
    
    try:
        # Delete all tasks first
        db.execute(
            f"DELETE FROM {db.table('tasks')} WHERE user_id = :user_id",
            {"user_id": user.user_id},
            fetch=False
        )
        
        # Delete all milestones (may not exist for all users, so wrap in try)
        try:
            db.execute(
                f"DELETE FROM {db.table('milestones')} WHERE user_id = :user_id",
                {"user_id": user.user_id},
                fetch=False
            )
        except Exception:
            pass  # Milestones table might not have data or exist
        
        # Delete all goals
        db.execute(
            f"DELETE FROM {db.table('goals')} WHERE user_id = :user_id",
            {"user_id": user.user_id},
            fetch=False
        )
        
        return SuccessResponse(message="All goals, tasks, and milestones deleted. Clean slate!")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")


@router.delete("/{goal_id}", response_model=SuccessResponse)
async def delete_goal(
    goal_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Delete a goal and all its associated tasks.
    
    This action is irreversible.
    """
    # Verify ownership
    existing = db.execute(
        f"SELECT goal_id FROM {db.table('goals')} WHERE goal_id = :id AND user_id = :user_id",
        {"id": goal_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Delete tasks first (or rely on CASCADE if configured)
    db.execute(
        f"DELETE FROM {db.table('tasks')} WHERE goal_id = :goal_id",
        {"goal_id": goal_id},
        fetch=False
    )
    
    # Delete goal
    db.delete("goals", "goal_id", goal_id)
    
    return SuccessResponse(message="Goal and tasks deleted")


@router.post("/{goal_id}/recalculate", response_model=SuccessResponse)
async def recalculate_goal_progress(
    goal_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Recalculate the goal's current_count from its tasks.
    
    Useful if task counts have been manually edited.
    """
    # Verify ownership
    existing = db.execute(
        f"SELECT goal_id FROM {db.table('goals')} WHERE goal_id = :id AND user_id = :user_id",
        {"id": goal_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Sum completed counts from tasks
    result = db.execute(
        f"""
        SELECT COALESCE(SUM(completed_count), 0) AS total_completed
        FROM {db.table('tasks')}
        WHERE goal_id = :goal_id AND status NOT IN ('CANCELLED', 'ROLLED_OVER')
        """,
        {"goal_id": goal_id}
    )
    
    new_count = result[0]["total_completed"] if result else 0
    
    # Update goal
    db.execute(
        f"""
        UPDATE {db.table('goals')}
        SET current_count = :count, updated_at = CURRENT_TIMESTAMP()
        WHERE goal_id = :goal_id
        """,
        {"count": new_count, "goal_id": goal_id},
        fetch=False
    )
    
    return SuccessResponse(message=f"Progress recalculated: {new_count}")
