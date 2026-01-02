"""
Goal Dissection Agent

Uses an LLM endpoint (configurable via LLM_ENDPOINT env var) to create specific, actionable tasks.
"""

import json
import logging
import os
from datetime import date, timedelta
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole

from ..config import get_settings

logger = logging.getLogger(__name__)

# Initialize WorkspaceClient
try:
    w = WorkspaceClient()
    logger.info("WorkspaceClient initialized successfully")
except Exception as e:
    logger.error(f"WorkspaceClient init failed: {e}")
    w = None


def get_llm_endpoint() -> str:
    """Get the LLM endpoint from config or environment."""
    settings = get_settings()
    endpoint = settings.llm_endpoint or os.getenv("LLM_ENDPOINT", "")
    
    if not endpoint:
        raise Exception(
            "LLM_ENDPOINT is not configured. "
            "Set it in app.yaml env section or as an environment variable."
        )
    return endpoint


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 3000) -> str:
    """Call the configured LLM endpoint."""
    
    if w is None:
        raise Exception("WorkspaceClient not initialized")
    
    endpoint = get_llm_endpoint()
    logger.info(f"Calling endpoint: {endpoint}")
    
    try:
        logger.info(f"Making query to endpoint: {endpoint}")
        response = w.serving_endpoints.query(
            name=endpoint,
            messages=[
                ChatMessage(role=ChatMessageRole.SYSTEM, content=system_prompt),
                ChatMessage(role=ChatMessageRole.USER, content=user_prompt)
            ],
            max_tokens=max_tokens,
            temperature=0.3
        )
        
        content = response.choices[0].message.content.strip()
        logger.info(f"LLM response length: {len(content)} chars")
        logger.debug(f"LLM response: {content[:500]}")
        
        return content
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"LLM call failed: {error_msg}")
        
        # Provide more context in error
        if "permission" in error_msg.lower():
            raise Exception(f"Permission denied for endpoint '{endpoint}'. Grant CAN_QUERY to the app's service principal.")
        elif "not found" in error_msg.lower():
            raise Exception(f"Endpoint '{endpoint}' not found. Check LLM_ENDPOINT in app.yaml.")
        elif "limit" in error_msg.lower() or "rate" in error_msg.lower():
            raise Exception(f"Rate limit exceeded for '{endpoint}'. Please try again in a moment.")
        else:
            raise Exception(f"LLM call failed: {error_msg}")


def parse_json_response(content: str) -> list[dict]:
    """Parse JSON from LLM response."""
    
    # Try direct parse
    try:
        result = json.loads(content)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "tasks" in result:
            return result["tasks"]
    except json.JSONDecodeError:
        pass
    
    # Extract from markdown code blocks
    if "```json" in content:
        json_str = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 2:
            json_str = parts[1].strip()
            # Remove language identifier if present
            if json_str.startswith("json"):
                json_str = json_str[4:].strip()
        else:
            json_str = content
    else:
        # Try to find JSON array in the content
        start = content.find('[')
        end = content.rfind(']')
        if start != -1 and end != -1:
            json_str = content[start:end+1]
        else:
            json_str = content
    
    try:
        result = json.loads(json_str)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        logger.error(f"Content was: {content[:1000]}")
        raise Exception(f"Failed to parse LLM response as JSON: {str(e)}")
    
    raise Exception("LLM response was not a valid JSON array")


def dissect_goal(
    title: str,
    description: str,
    start_date: date,
    end_date: date,
    weekly_hours: int,
    experience_level: str = "intermediate"
) -> dict[str, Any]:
    """
    Main function: Use LLM to dissect a goal into specific tasks.
    The LLM decides how many tasks based on the goal - we distribute them across weeks.
    """
    
    # Calculate timeline
    total_days = (end_date - start_date).days
    total_weeks = max(1, total_days // 7)
    total_hours = weekly_hours * total_weeks
    
    # Build prompts - LLM decides task count based on goal
    system_prompt = """You are an expert project planner and learning coach.
You break down goals into SPECIFIC, ACTIONABLE tasks that can be completed and verified.

RULES:
1. YOU decide how many tasks are appropriate for the goal (could be 1 or could be 20)
2. If the user specifies a number of tasks in their description, respect that
3. Each task must be specific with exact quantities, tools, or deliverables
4. Tasks should progressively build toward the goal
5. Each task should take 1-8 hours depending on complexity

Always respond with a valid JSON array only."""

    user_prompt = f"""Analyze this goal and create the RIGHT NUMBER of specific tasks:

GOAL: {title}
DESCRIPTION: {description or 'No additional details provided'}
TIMELINE: {total_weeks} weeks available
TOTAL TIME: {total_hours} hours ({weekly_hours} hours per week)
EXPERIENCE LEVEL: {experience_level}

IMPORTANT: 
- If the description says "1 task" or "single task" - create exactly 1 task
- If the description says "5 tasks" - create exactly 5 tasks
- If no number specified, decide based on goal complexity and timeline
- Simple goals might need 2-3 tasks, complex goals might need 10-15

Requirements for each task:
- Include specific tool/resource names (e.g., "Python.org tutorial", "VS Code", specific book names)
- Include exact quantities where applicable (e.g., "chapters 1-4", "5 exercises", "2 miles")
- Be completable and verifiable

Examples:
- "Learn cooking basics" (10 weeks) → 8-10 tasks covering different skills
- "Write a blog post" (1 week) → 3-4 tasks (research, outline, draft, edit)
- "Run a marathon" (16 weeks) → 12-16 progressive training tasks
- "Read one book" (2 weeks, user says "1 task") → 1 task

Now analyze "{title}" with description "{description or 'none'}" and create the appropriate tasks.

Return ONLY a JSON array:
[
  {{"title": "Specific task with tool/quantity/deliverable", "description": "Detailed steps", "hours": 3}},
  ...
]"""

    # Call LLM
    content = call_llm(system_prompt, user_prompt)
    
    # Parse response
    tasks = parse_json_response(content)
    
    if not tasks:
        raise Exception("LLM returned empty task list")
    
    # Validate and format tasks
    formatted_tasks = []
    for i, task in enumerate(tasks):
        if not isinstance(task, dict):
            continue
        
        task_title = task.get("title", "")
        if not task_title or len(task_title) < 10:
            continue
        
        hours = task.get("hours", 3)
        if isinstance(hours, str):
            try:
                hours = int(hours)
            except:
                hours = 3
        
        formatted_tasks.append({
            "title": task_title,
            "description": task.get("description", task_title),
            "hours": max(1, min(hours, 8)),
            "order": i + 1
        })
    
    if len(formatted_tasks) < 1:
        raise Exception("No valid tasks were generated by the LLM")
    
    # Distribute tasks across weeks
    distributed = distribute_tasks(formatted_tasks, start_date, total_weeks, weekly_hours)
    
    # Build response
    return build_response(distributed, total_weeks, weekly_hours, total_hours)


def distribute_tasks(
    tasks: list[dict],
    start_date: date,
    total_weeks: int,
    weekly_hours: int
) -> list[dict]:
    """Distribute tasks evenly across all available weeks."""
    
    if not tasks:
        return []
    
    distributed = []
    tasks_per_week = len(tasks) / total_weeks
    
    for i, task in enumerate(tasks):
        # Calculate which week (spread evenly)
        week_num = min(int(i / tasks_per_week), total_weeks - 1)
        
        # Calculate week dates
        week_start = start_date + timedelta(weeks=week_num)
        week_end = week_start + timedelta(days=6)
        year_week = week_start.strftime("%Y-%W")
        
        distributed.append({
            "title": task["title"],
            "description": task.get("description", ""),
            "estimated_hours": task.get("hours", 3),
            "order": task.get("order", i + 1),
            "week_number": week_num + 1,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "year_week": year_week,
            "type": "task"
        })
    
    return distributed


def build_response(
    tasks: list[dict],
    total_weeks: int,
    weekly_hours: int,
    total_hours: int
) -> dict[str, Any]:
    """Build the final response."""
    
    # Calculate weekly summary
    weekly_summary = {}
    for task in tasks:
        week = str(task["week_number"])
        if week not in weekly_summary:
            weekly_summary[week] = {"tasks": 0, "hours": 0}
        weekly_summary[week]["tasks"] += 1
        weekly_summary[week]["hours"] += task["estimated_hours"]
    
    # Find overloaded weeks
    overloaded_weeks = []
    for week, data in weekly_summary.items():
        if data["hours"] > weekly_hours:
            excess = data["hours"] - weekly_hours
            overloaded_weeks.append({
                "week": week,
                "hours": data["hours"],
                "capacity": weekly_hours,
                "excess": round(excess, 1),
                "task_count": data["tasks"]
            })
    
    total_estimated = sum(t["estimated_hours"] for t in tasks)
    
    return {
        "analysis": {
            "total_tasks": len(tasks),
            "total_estimated_hours": total_estimated,
            "hours_per_task": round(total_estimated / len(tasks), 1) if tasks else 0,
        },
        "tasks": tasks,
        "summary": {
            "total_tasks": len(tasks),
            "total_weeks": total_weeks,
            "total_hours_available": total_hours,
            "total_hours_estimated": round(total_estimated, 1),
            "weekly_hours": weekly_hours,
            "is_achievable": total_estimated <= total_hours,
        },
        "weekly_summary": weekly_summary,
        "overloaded_weeks": overloaded_weeks,
        "warnings": [
            f"Week {w['week']} needs {w['hours']}h but you have {w['capacity']}h budgeted"
            for w in overloaded_weeks
        ]
    }
