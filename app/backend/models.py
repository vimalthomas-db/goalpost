"""
Goalpost Pydantic Models

Data validation schemas for API requests and responses.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import date, datetime
from enum import Enum
from typing import Optional


# ============================================================================
# ENUMS
# ============================================================================

class GoalStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    PAUSED = "PAUSED"
    ARCHIVED = "ARCHIVED"


class TaskStatus(str, Enum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    BLOCKED = "BLOCKED"
    ROLLED_OVER = "ROLLED_OVER"
    CANCELLED = "CANCELLED"


# ============================================================================
# GOAL MODELS
# ============================================================================

class GoalType(str, Enum):
    """Type of goal - affects how progress is tracked."""
    QUANTITATIVE = "QUANTITATIVE"  # Count-based (read 52 books)
    PROJECT = "PROJECT"            # Task/milestone-based (build feature)
    HABIT = "HABIT"                # Frequency-based (exercise daily)


class GoalCreate(BaseModel):
    """Request model for creating a goal."""
    
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    target_count: int | None = Field(default=None, ge=0, le=100000, description="Optional - AI will infer from description if not provided")
    start_date: date
    end_date: date
    priority: int = Field(default=3, ge=1, le=5)
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    tags: list[str] = Field(default_factory=list)
    use_ai: bool = Field(default=True, description="Use AI to intelligently plan - now default ON")
    
    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v
    
    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        return [tag.strip().lower() for tag in v if tag.strip()][:10]


class GoalUpdate(BaseModel):
    """Request model for updating a goal."""
    
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    target_count: int | None = Field(default=None, gt=0, le=100000)
    priority: int | None = Field(default=None, ge=1, le=5)
    status: GoalStatus | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    tags: list[str] | None = None


class GoalResponse(BaseModel):
    """Response model for a goal."""
    
    model_config = ConfigDict(from_attributes=True)
    
    goal_id: str
    user_id: str
    title: str
    description: str | None
    target_count: int
    current_count: int
    start_date: date
    end_date: date
    priority: int
    status: str
    color: str
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime | None
    completed_at: datetime | None
    progress_percent: float = 0.0
    
    @field_validator("progress_percent", mode="before")
    @classmethod
    def calculate_progress(cls, v, info) -> float:
        if v is not None:
            return v
        data = info.data
        target = data.get("target_count", 0)
        current = data.get("current_count", 0)
        if target > 0:
            return round(current * 100.0 / target, 1)
        return 0.0


class MilestoneResponse(BaseModel):
    """Response model for a milestone."""
    
    model_config = ConfigDict(from_attributes=True)
    
    milestone_id: str
    goal_id: str
    title: str
    description: str | None
    target_count: int | None
    due_date: date | None
    completed: bool = False
    completed_at: datetime | None = None
    sort_order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # Computed fields
    total_tasks: int = 0
    completed_tasks: int = 0
    progress_percent: float = 0.0


class GoalWithTasks(GoalResponse):
    """Goal response including milestones and tasks."""
    
    milestones: list[MilestoneResponse] = Field(default_factory=list)
    tasks: list["TaskResponse"] = Field(default_factory=list)
    total_tasks: int = 0
    completed_tasks: int = 0


# ============================================================================
# TASK MODELS
# ============================================================================

class TaskCreate(BaseModel):
    """Request model for creating a task (usually auto-generated)."""
    
    goal_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    week_start: date
    week_end: date
    target_count: int = Field(..., ge=0)
    priority: int = Field(default=3, ge=1, le=5)
    milestone_id: str | None = None


class TaskUpdate(BaseModel):
    """Request model for updating a task."""
    
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: TaskStatus | None = None
    completed_count: int | None = Field(default=None, ge=0)
    priority: int | None = Field(default=None, ge=1, le=5)
    sort_order: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=5000)
    assignee: str | None = None


class TaskMove(BaseModel):
    """Request model for moving a task to a different week."""
    
    new_week_start: date
    new_sort_order: int | None = None


class TaskResponse(BaseModel):
    """Response model for a task."""
    
    model_config = ConfigDict(from_attributes=True)
    
    task_id: str
    goal_id: str
    milestone_id: str | None
    user_id: str
    title: str
    description: str | None
    week_start: date
    week_end: date
    year_week: str
    target_count: int
    completed_count: int
    status: str
    priority: int
    sort_order: int
    assignee: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None
    completed_at: datetime | None
    rolled_over_from: str | None
    
    # Optional fields populated by joins
    goal_title: str | None = None
    goal_color: str | None = None


# ============================================================================
# DASHBOARD MODELS
# ============================================================================

class WeekSummary(BaseModel):
    """Summary stats for a single week."""
    
    year_week: str
    week_start: date
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    total_target: int
    total_completed: int
    completion_percent: float


class DashboardStats(BaseModel):
    """Overall dashboard statistics."""
    
    total_goals: int
    active_goals: int
    total_tasks: int
    completed_tasks: int
    overdue_tasks: int
    completion_percent: float


class DashboardResponse(BaseModel):
    """Full dashboard data response."""
    
    stats: DashboardStats
    current_week: list[TaskResponse]
    upcoming_week: list[TaskResponse]
    overdue: list[TaskResponse]
    recent_goals: list[GoalResponse]


# ============================================================================
# GENERIC RESPONSES
# ============================================================================

class SuccessResponse(BaseModel):
    """Generic success response."""
    
    status: str = "ok"
    message: str | None = None


class CreatedResponse(BaseModel):
    """Response for created resources."""
    
    status: str = "created"
    id: str
    message: str | None = None


class ErrorResponse(BaseModel):
    """Error response."""
    
    status: str = "error"
    detail: str
    code: str | None = None

