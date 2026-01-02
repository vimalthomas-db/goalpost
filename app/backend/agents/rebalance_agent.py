"""
Task Rebalance Agent

Redistributes tasks based on:
1. Overdue tasks: ALWAYS moved to current/future weeks
2. Current week: Limited by current_week_hours
3. Future weeks: Limited by future_week_hours
4. Priority: Low priority tasks (4-5) move first, high priority (1-2) move last

NEW: Pull Forward Feature
- If current week has spare capacity, pull high-priority tasks from future weeks

Logic:
- Past weeks (overdue): Capacity = 0 → All tasks must move forward
- Current week: Uses current_week_hours capacity
- Future weeks: Uses future_week_hours capacity
- Priority order for pushing: 5 (Optional) → 4 (Low) → 3 (Medium) → 2 (High) → 1 (Urgent)
- Priority order for pulling: 1 (Urgent) → 2 (High) → 3 (Medium) → 4 (Low) → 5 (Optional)
"""

import logging
from datetime import date, timedelta
from typing import Any
from collections import defaultdict

from ..db import get_db

logger = logging.getLogger(__name__)


def get_current_week_start() -> date:
    """Get Monday of current week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


def get_user_tasks(user_id: str) -> list[dict]:
    """Get all pending tasks for a user (including overdue)."""
    db = get_db()
    
    tasks = db.execute(f"""
        SELECT 
            t.task_id,
            t.goal_id,
            t.title,
            t.week_start,
            t.week_end,
            t.year_week,
            t.target_count,
            t.status,
            t.priority,
            g.title as goal_title,
            g.end_date as goal_deadline,
            g.priority as goal_priority
        FROM {db.table('tasks')} t
        JOIN {db.table('goals')} g ON t.goal_id = g.goal_id
        WHERE t.user_id = :user_id 
          AND t.status NOT IN ('DONE', 'CANCELLED')
          AND g.status = 'ACTIVE'
        ORDER BY t.week_start, t.priority DESC
        LIMIT 300
    """, {"user_id": user_id})
    
    return tasks or []


def calculate_rebalance(
    user_id: str,
    current_week_hours: float,
    future_week_hours: float,
    use_ai: bool = False
) -> dict[str, Any]:
    """
    Calculate a rebalance plan with:
    1. Push overdue tasks forward
    2. Push overloaded week tasks forward
    3. Pull tasks back to current week if there's spare capacity
    """
    
    logger.info(f"Rebalance: current_week={current_week_hours}h, future={future_week_hours}h")
    
    tasks = get_user_tasks(user_id)
    
    if not tasks:
        return {
            "success": True,
            "message": "No pending tasks to rebalance",
            "recommendations": [],
            "changes": [],
            "summary": {
                "total_tasks_analyzed": 0,
                "tasks_to_move": 0,
                "hours_per_week": future_week_hours,
                "overloaded_weeks": [],
                "overdue_tasks_moved": 0,
                "pulled_forward": 0
            }
        }
    
    # Get current week boundary
    current_week_start = get_current_week_start()
    current_year_week = current_week_start.strftime("%Y-%W")
    
    logger.info(f"Current week: {current_year_week} (starts {current_week_start})")
    
    # Group tasks by week and categorize
    tasks_by_week = defaultdict(list)
    week_info = {}
    
    for task in tasks:
        year_week = task["year_week"]
        tasks_by_week[year_week].append(task)
        
        if year_week not in week_info:
            week_start = task["week_start"]
            if isinstance(week_start, str):
                week_start_date = date.fromisoformat(week_start)
            else:
                week_start_date = week_start
            
            # Determine week type
            if week_start_date < current_week_start:
                week_type = "overdue"
            elif year_week == current_year_week:
                week_type = "current"
            else:
                week_type = "future"
            
            week_info[year_week] = {
                "week_start": week_start,
                "week_end": task["week_end"],
                "week_start_date": week_start_date,
                "type": week_type
            }
            
            logger.info(f"Week {year_week}: type={week_type}")
    
    sorted_weeks = sorted(tasks_by_week.keys())
    
    # Task hours calculation
    def get_hours(task):
        tc = task.get("target_count")
        if tc is None or tc <= 0 or tc > 20:
            return 1
        return min(tc, 8)
    
    # Track loads
    week_load = {}
    for week in sorted_weeks:
        week_load[week] = sum(get_hours(t) for t in tasks_by_week[week])
    
    # Get capacity for a week
    def get_capacity(year_week):
        info = week_info.get(year_week, {})
        week_type = info.get("type", "future")
        
        if week_type == "overdue":
            return 0  # FORCE all overdue tasks to move
        elif week_type == "current":
            return current_week_hours
        else:
            return future_week_hours
    
    changes = []
    recommendations = []
    overdue_count = 0
    pulled_forward_count = 0
    
    # ============================================
    # PHASE 1: Push overloaded tasks forward
    # ============================================
    for week in sorted_weeks:
        week_tasks = tasks_by_week[week]
        current_hours = week_load[week]
        capacity = get_capacity(week)
        week_type = week_info[week]["type"]
        
        logger.info(f"[PUSH] {week} ({week_type}): {current_hours}h tasks, {capacity}h capacity")
        
        if current_hours <= capacity:
            continue
        
        # Week is overloaded - need to move tasks
        excess = current_hours - capacity
        
        # Sort by priority: higher number = lower priority = move first
        # Also skip IN_PROGRESS tasks
        movable_tasks = [t for t in week_tasks if t["status"] != "IN_PROGRESS"]
        movable_tasks = sorted(movable_tasks, key=lambda x: -x.get("priority", 3))
        
        if week_type == "overdue":
            logger.info(f"OVERDUE week {week}: Moving ALL {len(movable_tasks)} tasks forward")
        
        for task in movable_tasks:
            # For overdue weeks, move ALL tasks (not just excess)
            if week_type != "overdue" and excess <= 0:
                break
            
            task_hours = get_hours(task)
            
            # Find target week with capacity
            target_week = None
            target_week_start = None
            
            # Start looking from current week for overdue tasks, or next week for others
            if week_type == "overdue":
                search_weeks = [w for w in sorted_weeks if week_info.get(w, {}).get("type") in ("current", "future")]
            else:
                week_idx = sorted_weeks.index(week)
                search_weeks = sorted_weeks[week_idx + 1:]
            
            for candidate_week in search_weeks:
                candidate_capacity = get_capacity(candidate_week)
                candidate_hours = week_load.get(candidate_week, 0)
                
                if candidate_hours + task_hours <= candidate_capacity:
                    target_week = candidate_week
                    target_week_start = week_info[candidate_week]["week_start"]
                    break
            
            # If no existing week has room, create a new week
            if not target_week:
                if sorted_weeks:
                    last_week = sorted_weeks[-1]
                    last_week_start = week_info[last_week]["week_start"]
                    
                    if isinstance(last_week_start, str):
                        last_week_start_date = date.fromisoformat(last_week_start)
                    else:
                        last_week_start_date = last_week_start
                    
                    new_week_start = last_week_start_date + timedelta(weeks=1)
                else:
                    new_week_start = current_week_start
                
                new_week_end = new_week_start + timedelta(days=6)
                new_year_week = new_week_start.strftime("%Y-%W")
                
                # Check goal deadline
                goal_deadline = task.get("goal_deadline")
                can_extend = True
                if goal_deadline:
                    if isinstance(goal_deadline, str):
                        goal_deadline = date.fromisoformat(goal_deadline)
                    if new_week_start > goal_deadline:
                        can_extend = False
                
                if can_extend:
                    target_week = new_year_week
                    target_week_start = new_week_start.isoformat()
                    
                    sorted_weeks.append(target_week)
                    week_info[target_week] = {
                        "week_start": target_week_start,
                        "week_end": new_week_end.isoformat(),
                        "week_start_date": new_week_start,
                        "type": "future"
                    }
                    week_load[target_week] = 0
            
            if target_week:
                reason = f"Overdue task" if week_type == "overdue" else f"Priority {task['priority']} - pushed forward"
                
                changes.append({
                    "action": "move",
                    "task_id": task["task_id"],
                    "task_title": task["title"][:60],
                    "from_week": week,
                    "to_week": target_week,
                    "target_week_start": target_week_start if isinstance(target_week_start, str) else target_week_start.isoformat(),
                    "reason": reason,
                    "is_overdue": week_type == "overdue",
                    "direction": "push"
                })
                
                if week_type == "overdue":
                    overdue_count += 1
                
                # Update tracking
                excess -= task_hours
                week_load[week] -= task_hours
                week_load[target_week] = week_load.get(target_week, 0) + task_hours
    
    # ============================================
    # PHASE 2: Pull tasks back to current week if there's spare capacity
    # ============================================
    if current_year_week in week_info:
        current_week_load = week_load.get(current_year_week, 0)
        spare_capacity = current_week_hours - current_week_load
        
        logger.info(f"[PULL] Current week {current_year_week}: {current_week_load}h used, {spare_capacity}h spare")
        
        if spare_capacity > 0:
            # Get all future weeks (sorted chronologically)
            future_weeks = [w for w in sorted_weeks 
                          if week_info.get(w, {}).get("type") == "future"]
            
            for future_week in future_weeks:
                if spare_capacity <= 0:
                    break
                
                future_tasks = tasks_by_week.get(future_week, [])
                
                # Sort by priority: lower number = higher priority = pull first
                pullable_tasks = [t for t in future_tasks if t["status"] == "NEW"]
                pullable_tasks = sorted(pullable_tasks, key=lambda x: x.get("priority", 3))
                
                for task in pullable_tasks:
                    if spare_capacity <= 0:
                        break
                    
                    # Skip if task was already moved in phase 1
                    if any(c["task_id"] == task["task_id"] for c in changes):
                        continue
                    
                    task_hours = get_hours(task)
                    
                    if task_hours <= spare_capacity:
                        current_week_start_str = week_info[current_year_week]["week_start"]
                        if not isinstance(current_week_start_str, str):
                            current_week_start_str = current_week_start_str.isoformat()
                        
                        changes.append({
                            "action": "move",
                            "task_id": task["task_id"],
                            "task_title": task["title"][:60],
                            "from_week": future_week,
                            "to_week": current_year_week,
                            "target_week_start": current_week_start_str,
                            "reason": f"Priority {task['priority']} - pulled to current week",
                            "is_overdue": False,
                            "direction": "pull"
                        })
                        
                        pulled_forward_count += 1
                        spare_capacity -= task_hours
                        week_load[future_week] -= task_hours
                        week_load[current_year_week] = week_load.get(current_year_week, 0) + task_hours
                        
                        logger.info(f"PULL: '{task['title'][:30]}' from {future_week} → {current_year_week}")
    else:
        # No tasks in current week yet - check if we can pull from future
        if current_week_hours > 0:
            spare_capacity = current_week_hours
            
            future_weeks = [w for w in sorted_weeks 
                          if week_info.get(w, {}).get("type") == "future"]
            
            for future_week in future_weeks:
                if spare_capacity <= 0:
                    break
                
                future_tasks = tasks_by_week.get(future_week, [])
                pullable_tasks = [t for t in future_tasks if t["status"] == "NEW"]
                pullable_tasks = sorted(pullable_tasks, key=lambda x: x.get("priority", 3))
                
                for task in pullable_tasks:
                    if spare_capacity <= 0:
                        break
                    
                    if any(c["task_id"] == task["task_id"] for c in changes):
                        continue
                    
                    task_hours = get_hours(task)
                    
                    if task_hours <= spare_capacity:
                        current_week_start_str = current_week_start.isoformat()
                        
                        changes.append({
                            "action": "move",
                            "task_id": task["task_id"],
                            "task_title": task["title"][:60],
                            "from_week": future_week,
                            "to_week": current_year_week,
                            "target_week_start": current_week_start_str,
                            "reason": f"Priority {task['priority']} - pulled to current week",
                            "is_overdue": False,
                            "direction": "pull"
                        })
                        
                        pulled_forward_count += 1
                        spare_capacity -= task_hours
                        week_load[future_week] -= task_hours
                        week_load[current_year_week] = week_load.get(current_year_week, 0) + task_hours
                        
                        # Add current week to tracking if new
                        if current_year_week not in week_info:
                            week_info[current_year_week] = {
                                "week_start": current_week_start_str,
                                "week_end": (current_week_start + timedelta(days=6)).isoformat(),
                                "week_start_date": current_week_start,
                                "type": "current"
                            }
    
    # ============================================
    # Calculate remaining overloaded weeks
    # ============================================
    overloaded_weeks = []
    for week in sorted_weeks:
        week_type = week_info.get(week, {}).get("type", "future")
        if week_type == "overdue":
            continue
        
        capacity = get_capacity(week)
        hours = week_load.get(week, 0)
        
        if hours > capacity:
            overloaded_weeks.append({
                "week": week,
                "hours": round(hours, 1),
                "capacity": capacity,
                "excess": round(hours - capacity, 1),
                "task_count": len(tasks_by_week.get(week, []))
            })
    
    # Build message
    messages = []
    if overdue_count > 0:
        messages.append(f"{overdue_count} overdue tasks pushed forward")
    
    pushed_count = len([c for c in changes if c.get("direction") == "push" and not c.get("is_overdue")])
    if pushed_count > 0:
        messages.append(f"{pushed_count} tasks pushed to later weeks")
    
    if pulled_forward_count > 0:
        messages.append(f"{pulled_forward_count} tasks pulled to this week")
    
    if len(overloaded_weeks) > 0:
        messages.append(f"{len(overloaded_weeks)} weeks still overloaded")
    
    if len(changes) == 0 and len(overloaded_weeks) == 0:
        message = "Your workload is already balanced!"
        recommendations.append("Great job managing your time!")
    elif len(changes) > 0 and len(overloaded_weeks) == 0:
        message = " | ".join(messages) if messages else f"Moving {len(changes)} tasks"
        recommendations.append("Apply changes to optimize your schedule")
    else:
        message = " | ".join(messages) if messages else "Rebalance calculated"
        recommendations.append("Some high-priority tasks can't be moved")
        recommendations.append(f"Consider increasing weekly hours above {future_week_hours}h")
    
    logger.info(f"Result: {len(changes)} changes (push: {pushed_count + overdue_count}, pull: {pulled_forward_count})")
    
    return {
        "success": True,
        "message": message,
        "recommendations": recommendations,
        "changes": changes,
        "summary": {
            "total_tasks_analyzed": len(tasks),
            "tasks_to_move": len(changes),
            "hours_per_week": future_week_hours,
            "current_week_hours": current_week_hours,
            "overloaded_weeks": overloaded_weeks,
            "overdue_tasks_moved": overdue_count,
            "pulled_forward": pulled_forward_count
        }
    }


def apply_rebalance(user_id: str, changes: list[dict]) -> dict[str, Any]:
    """Apply rebalance changes to the database."""
    
    db = get_db()
    applied = []
    errors = []
    
    for change in changes:
        if change.get("action") != "move":
            continue
        
        task_id = change["task_id"]
        target_week_start = change.get("target_week_start")
        
        if not target_week_start:
            errors.append({"task_id": task_id, "error": "No target week start"})
            continue
        
        try:
            if isinstance(target_week_start, str):
                week_start = date.fromisoformat(target_week_start)
            else:
                week_start = target_week_start
            
            week_end = week_start + timedelta(days=6)
            year_week = week_start.strftime("%Y-%W")
            
            # Verify task belongs to user
            task = db.execute(
                f"SELECT task_id FROM {db.table('tasks')} WHERE task_id = :task_id AND user_id = :user_id",
                {"task_id": task_id, "user_id": user_id}
            )
            
            if not task:
                errors.append({"task_id": task_id, "error": "Task not found"})
                continue
            
            # Update task
            db.execute(f"""
                UPDATE {db.table('tasks')}
                SET week_start = :week_start,
                    week_end = :week_end,
                    year_week = :year_week,
                    updated_at = CURRENT_TIMESTAMP()
                WHERE task_id = :task_id
            """, {
                "task_id": task_id,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "year_week": year_week
            }, fetch=False)
            
            applied.append({
                "task_id": task_id,
                "task_title": change.get("task_title", ""),
                "from_week": change["from_week"],
                "to_week": year_week,
                "direction": change.get("direction", "push")
            })
            
            logger.info(f"Moved task {task_id} to {year_week} ({change.get('direction', 'push')})")
            
        except Exception as e:
            logger.error(f"Failed to move task {task_id}: {e}")
            errors.append({"task_id": task_id, "error": str(e)})
    
    return {
        "success": len(errors) == 0,
        "applied": applied,
        "errors": errors,
        "total_applied": len(applied),
        "total_errors": len(errors)
    }
