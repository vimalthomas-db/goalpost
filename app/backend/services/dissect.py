"""
Goal Dissection Service

Breaks down high-level goals into weekly tasks.
This is pure Python - no Spark needed!
"""

from datetime import date, timedelta
from typing import Any
import uuid


def iso_week_start(d: date) -> date:
    """
    Get the Monday (ISO week start) of the week containing date d.
    
    Args:
        d: Any date
    
    Returns:
        The Monday of that week
    """
    return d - timedelta(days=d.weekday())


def weeks_between(start_date: date, end_date: date) -> list[tuple[date, date]]:
    """
    Generate all weeks (Monday-Sunday) between two dates.
    
    Args:
        start_date: Start of the goal period
        end_date: End of the goal period
    
    Returns:
        List of (week_start, week_end) tuples
    """
    weeks = []
    current = iso_week_start(start_date)
    end = iso_week_start(end_date)
    
    while current <= end:
        week_start = current
        week_end = current + timedelta(days=6)
        weeks.append((week_start, week_end))
        current += timedelta(days=7)
    
    return weeks


def distribute_evenly(total: int, slots: int) -> list[int]:
    """
    Distribute a total count evenly across N slots.
    
    Handles remainders by adding 1 to the first N slots.
    
    Args:
        total: Total count to distribute
        slots: Number of slots to distribute across
    
    Returns:
        List of counts per slot
    
    Example:
        distribute_evenly(10, 3) -> [4, 3, 3]
        distribute_evenly(100, 52) -> [2, 2, 2, ..., 1, 1, ...]
    """
    if slots <= 0:
        return []
    
    base = total // slots
    remainder = total % slots
    
    return [base + (1 if i < remainder else 0) for i in range(slots)]


def dissect_goal(
    goal_id: str,
    user_id: str,
    title: str,
    target_count: int,
    start_date: date,
    end_date: date,
    priority: int = 3,
    milestone_id: str | None = None
) -> list[dict[str, Any]]:
    """
    Dissect a goal into weekly tasks.
    
    Takes a high-level goal with a target count and date range,
    and breaks it down into weekly tasks with evenly distributed counts.
    
    Args:
        goal_id: ID of the parent goal
        user_id: ID of the user who owns the goal
        title: Base title for tasks (will be appended with week number)
        target_count: Total target to achieve
        start_date: When to start working on the goal
        end_date: Deadline for the goal
        priority: Task priority (1-5)
        milestone_id: Optional milestone to associate tasks with
    
    Returns:
        List of task dictionaries ready for database insertion
    
    Example:
        tasks = dissect_goal(
            goal_id="abc123",
            user_id="user456",
            title="Write blog posts",
            target_count=52,
            start_date=date(2025, 1, 1),
            end_date=date(2025, 12, 31),
            priority=2
        )
        # Returns 52 tasks, each with target_count=1
    """
    # Calculate weeks
    weeks = weeks_between(start_date, end_date)
    
    if not weeks:
        return []
    
    # Smart distribution: if target < weeks, space out tasks evenly
    num_weeks = len(weeks)
    
    if target_count >= num_weeks:
        # More targets than weeks: distribute across all weeks
        counts = distribute_evenly(target_count, num_weeks)
        selected_weeks = list(range(num_weeks))
    else:
        # Fewer targets than weeks: space out tasks evenly
        # E.g., 10 tasks over 52 weeks = 1 task every ~5 weeks
        counts = [1] * target_count
        step = num_weeks / target_count
        selected_weeks = [int(i * step) for i in range(target_count)]
    
    # Generate tasks only for selected weeks
    tasks = []
    task_num = 0
    for idx, count in zip(selected_weeks, counts):
        if count <= 0:
            continue
            
        week_start, week_end = weeks[idx]
        task_id = str(uuid.uuid4())
        year_week = week_start.strftime("%Y-%W")
        
        task = {
            "task_id": task_id,
            "goal_id": goal_id,
            "milestone_id": milestone_id,
            "user_id": user_id,
            "title": f"{title} (Task {task_num + 1})",
            "description": "",
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "year_week": year_week,
            "target_count": count,
            "completed_count": 0,
            "status": "NEW",
            "priority": priority,
            "sort_order": task_num,
            "assignee": None,
            "notes": None,
        }
        
        tasks.append(task)
        task_num += 1
    
    return tasks


def redissect_remaining(
    goal_id: str,
    user_id: str,
    title: str,
    remaining_count: int,
    from_date: date,
    end_date: date,
    priority: int = 3
) -> list[dict[str, Any]]:
    """
    Re-dissect remaining work from a specific date.
    
    Useful for redistributing work after falling behind or
    when adjusting a goal mid-stream.
    
    Args:
        goal_id: ID of the parent goal
        user_id: ID of the user
        title: Base title for tasks
        remaining_count: How much is left to do
        from_date: Start redistributing from this date
        end_date: Goal deadline
        priority: Task priority
    
    Returns:
        List of new task dictionaries
    """
    # Snap to Monday
    from_monday = iso_week_start(from_date)
    
    return dissect_goal(
        goal_id=goal_id,
        user_id=user_id,
        title=title,
        target_count=remaining_count,
        start_date=from_monday,
        end_date=end_date,
        priority=priority
    )

