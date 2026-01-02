"""
Tasks Router

CRUD endpoints for task management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Annotated
from datetime import date, timedelta
import uuid

from ..auth import CurrentUser
from ..db import get_db, LakebaseClient
from ..models import (
    TaskCreate, TaskUpdate, TaskMove, TaskResponse,
    SuccessResponse, CreatedResponse
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def get_year_week(d: date) -> str:
    """Get ISO year-week string (e.g., '2025-01')."""
    return d.strftime("%Y-%W")


def get_week_bounds(d: date) -> tuple[date, date]:
    """Get Monday and Sunday of the week containing date d."""
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)],
    goal_id: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    week_start: date | None = None,
    year_week: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    List tasks with optional filters.
    
    - **goal_id**: Filter by goal
    - **status**: Filter by task status
    - **week_start**: Filter by week starting date
    - **year_week**: Filter by year-week string (e.g., '2025-01')
    """
    query = f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
    """
    params = {"user_id": user.user_id, "limit": limit, "offset": offset}
    
    if goal_id:
        query += " AND t.goal_id = :goal_id"
        params["goal_id"] = goal_id
    
    if status_filter:
        query += " AND t.status = :status"
        params["status"] = status_filter.upper()
    
    if week_start:
        query += " AND t.week_start = :week_start"
        params["week_start"] = week_start.isoformat()
    
    if year_week:
        query += " AND t.year_week = :year_week"
        params["year_week"] = year_week
    
    query += " ORDER BY t.week_start, t.priority, t.sort_order LIMIT :limit OFFSET :offset"
    
    return db.execute(query, params)


@router.get("/week/{week_start}", response_model=list[TaskResponse])
async def get_tasks_for_week(
    week_start: date,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Get all tasks for a specific week.
    
    The week_start should be a Monday.
    """
    week_end = week_start + timedelta(days=6)
    
    tasks = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id
          AND t.week_start = :week_start
          AND t.status NOT IN ('CANCELLED', 'ROLLED_OVER')
        ORDER BY t.priority, t.sort_order
        """,
        {"user_id": user.user_id, "week_start": week_start.isoformat()}
    )
    
    return tasks


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """Get a specific task by ID."""
    result = db.execute(
        f"""
        SELECT 
            t.*,
            g.title AS goal_title,
            g.color AS goal_color
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.task_id = :task_id AND t.user_id = :user_id
        """,
        {"task_id": task_id, "user_id": user.user_id}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return result[0]


@router.patch("/{task_id}", response_model=SuccessResponse)
async def update_task(
    task_id: str,
    updates: TaskUpdate,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Update a task.
    
    When status is set to DONE, completed_at timestamp is automatically set.
    Updating completed_count will trigger a recalculation of the parent goal's progress.
    """
    # Verify ownership and get current state
    existing = db.execute(
        f"SELECT * FROM {db.table('tasks')} WHERE task_id = :id AND user_id = :user_id",
        {"id": task_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = existing[0]
    
    # Build update dict
    update_data = {}
    
    if updates.title is not None:
        update_data["title"] = updates.title
    
    if updates.description is not None:
        update_data["description"] = updates.description
    
    if updates.status is not None:
        update_data["status"] = updates.status.value
        if updates.status.value == "DONE":
            update_data["completed_at"] = "CURRENT_TIMESTAMP()"
    
    if updates.completed_count is not None:
        update_data["completed_count"] = updates.completed_count
    
    if updates.priority is not None:
        update_data["priority"] = updates.priority
    
    if updates.sort_order is not None:
        update_data["sort_order"] = updates.sort_order
    
    if updates.notes is not None:
        update_data["notes"] = updates.notes
    
    if updates.assignee is not None:
        update_data["assignee"] = updates.assignee
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Update task
    db.update("tasks", "task_id", task_id, update_data)
    
    # If completed_count changed, update parent goal's current_count
    if updates.completed_count is not None:
        old_count = task.get("completed_count", 0)
        diff = updates.completed_count - old_count
        
        if diff != 0:
            db.execute(
                f"""
                UPDATE {db.table('goals')}
                SET current_count = current_count + :diff, updated_at = CURRENT_TIMESTAMP()
                WHERE goal_id = :goal_id
                """,
                {"diff": diff, "goal_id": task["goal_id"]},
                fetch=False
            )
    
    return SuccessResponse(message="Task updated")


@router.post("/{task_id}/move", response_model=SuccessResponse)
async def move_task(
    task_id: str,
    move: TaskMove,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Move a task to a different week.
    
    This updates the week_start, week_end, and year_week fields.
    """
    # Verify ownership
    existing = db.execute(
        f"SELECT task_id FROM {db.table('tasks')} WHERE task_id = :id AND user_id = :user_id",
        {"id": task_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Calculate new week bounds
    week_start, week_end = get_week_bounds(move.new_week_start)
    year_week = get_year_week(week_start)
    
    update_data = {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "year_week": year_week
    }
    
    if move.new_sort_order is not None:
        update_data["sort_order"] = move.new_sort_order
    
    db.update("tasks", "task_id", task_id, update_data)
    
    return SuccessResponse(message=f"Task moved to week of {week_start}")


@router.post("/{task_id}/complete", response_model=SuccessResponse)
async def complete_task(
    task_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Mark a task as complete.
    
    Sets status to DONE and completed_count to target_count.
    """
    # Get task
    existing = db.execute(
        f"SELECT * FROM {db.table('tasks')} WHERE task_id = :id AND user_id = :user_id",
        {"id": task_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = existing[0]
    target = task.get("target_count", 0)
    old_completed = task.get("completed_count", 0)
    diff = target - old_completed
    
    # Update task
    db.execute(
        f"""
        UPDATE {db.table('tasks')}
        SET status = 'DONE', 
            completed_count = :target,
            completed_at = CURRENT_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP()
        WHERE task_id = :task_id
        """,
        {"target": target, "task_id": task_id},
        fetch=False
    )
    
    # Update goal progress
    if diff != 0:
        db.execute(
            f"""
            UPDATE {db.table('goals')}
            SET current_count = current_count + :diff, updated_at = CURRENT_TIMESTAMP()
            WHERE goal_id = :goal_id
            """,
            {"diff": diff, "goal_id": task["goal_id"]},
            fetch=False
        )
    
    return SuccessResponse(message="Task completed")


@router.delete("/{task_id}", response_model=SuccessResponse)
async def delete_task(
    task_id: str,
    user: CurrentUser,
    db: Annotated[LakebaseClient, Depends(get_db)]
):
    """
    Delete a task.
    
    Consider using PATCH to set status to CANCELLED instead for audit purposes.
    """
    # Verify ownership
    existing = db.execute(
        f"SELECT task_id FROM {db.table('tasks')} WHERE task_id = :id AND user_id = :user_id",
        {"id": task_id, "user_id": user.user_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete("tasks", "task_id", task_id)
    
    return SuccessResponse(message="Task deleted")

