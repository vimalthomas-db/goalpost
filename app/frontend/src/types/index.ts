// ============================================================================
// Type Definitions for Goalpost
// ============================================================================

export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ARCHIVED'
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'ROLLED_OVER' | 'CANCELLED'

export interface Goal {
  goal_id: string
  user_id: string
  title: string
  description: string | null
  target_count: number
  current_count: number
  start_date: string
  end_date: string
  priority: number
  status: GoalStatus
  color: string
  tags: string[] | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  progress_percent: number
}

export interface Milestone {
  milestone_id: string
  goal_id: string
  title: string
  description: string | null
  target_count: number
  due_date: string
  completed: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string | null
  // Computed fields
  total_tasks?: number
  completed_tasks?: number
  progress_percent?: number
}

export interface GoalWithTasks extends Goal {
  milestones: Milestone[]
  tasks: Task[]
  total_tasks: number
  completed_tasks: number
}

export interface Task {
  task_id: string
  goal_id: string
  milestone_id: string | null
  user_id: string
  title: string
  description: string | null
  week_start: string
  week_end: string
  year_week: string
  target_count: number
  completed_count: number
  status: TaskStatus
  priority: number
  sort_order: number
  assignee: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  rolled_over_from: string | null
  goal_title?: string
  goal_color?: string
}

export interface DashboardStats {
  total_goals: number
  active_goals: number
  total_tasks: number
  completed_tasks: number
  overdue_tasks: number
  completion_percent: number
}

export interface DashboardData {
  stats: DashboardStats
  current_week: Task[]
  upcoming_week: Task[]
  overdue: Task[]
  recent_goals: Goal[]
}

export interface WeekSummary {
  year_week: string
  week_start: string
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  total_target: number
  total_completed: number
  completion_percent: number
}

// Form types
export interface GoalCreateInput {
  title: string
  description?: string
  target_count?: number  // Optional - AI will infer from description
  start_date: string
  end_date: string
  priority?: number
  color?: string
  tags?: string[]
  use_ai?: boolean  // Use AI to intelligently plan task distribution (default: true)
}

export interface TaskUpdateInput {
  title?: string
  description?: string
  status?: TaskStatus
  completed_count?: number
  priority?: number
  sort_order?: number
  notes?: string
}

// API response types
export interface ApiResponse<T> {
  data: T
  status: string
}

export interface CreatedResponse {
  status: string
  id: string
  message?: string
}

export interface SuccessResponse {
  status: string
  message?: string
}

