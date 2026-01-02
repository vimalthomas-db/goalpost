import api from './client'
import type { Goal, GoalWithTasks, GoalCreateInput, CreatedResponse, SuccessResponse } from '../types'

// Goal Plan types - matching new backend structure
export interface GoalPlanRequest {
  title: string
  description?: string
  start_date: string
  end_date: string
  weekly_hours: number
  experience_level: string
}

export interface GoalPlanTask {
  title: string
  description: string
  estimated_hours: number
  week_number: number
  week_start: string
  week_end: string
  order: number
  type: string
}

export interface GoalPlanAnalysis {
  category: string
  subcategory: string
  skill_level: string
  deliverables: string[]
  key_skills_needed: string[]
  estimated_total_hours: number
  complexity: string
  measurable_target: {
    count: number | null
    unit: string
  }
  prerequisites: string[]
  success_criteria: string
}

export interface WeeklySummary {
  [week: string]: {
    tasks: number
    hours: number
  }
}

export interface OverloadedWeek {
  week: string
  hours: number
  capacity: number
  excess: number
  task_count: number
}

export interface GoalPlanResponse {
  analysis: GoalPlanAnalysis
  tasks: GoalPlanTask[]
  summary: {
    total_tasks: number
    total_weeks: number
    total_hours_available: number
    total_hours_estimated: number
    weekly_hours: number
    is_achievable: boolean
  }
  weekly_summary: WeeklySummary
  overloaded_weeks: OverloadedWeek[]
  warnings: string[]
}

export const goalsApi = {
  // List all goals
  list: async (status?: string): Promise<Goal[]> => {
    const params = status ? { status } : {}
    const { data } = await api.get<Goal[]>('/goals', { params })
    return data
  },

  // Get a single goal with tasks
  get: async (goalId: string): Promise<GoalWithTasks> => {
    const { data } = await api.get<GoalWithTasks>(`/goals/${goalId}`)
    return data
  },

  // Create a new goal
  create: async (goal: GoalCreateInput): Promise<CreatedResponse> => {
    const { data } = await api.post<CreatedResponse>('/goals', goal)
    return data
  },

  // Update a goal
  update: async (goalId: string, updates: Partial<GoalCreateInput>): Promise<SuccessResponse> => {
    const { data } = await api.patch<SuccessResponse>(`/goals/${goalId}`, updates)
    return data
  },

  // Delete a goal
  delete: async (goalId: string): Promise<SuccessResponse> => {
    const { data } = await api.delete<SuccessResponse>(`/goals/${goalId}`)
    return data
  },

  // Recalculate goal progress
  recalculate: async (goalId: string): Promise<SuccessResponse> => {
    const { data } = await api.post<SuccessResponse>(`/goals/${goalId}/recalculate`)
    return data
  },

  // Delete ALL goals (Clean Slate)
  deleteAll: async (): Promise<SuccessResponse> => {
    const { data } = await api.delete<SuccessResponse>('/goals/all', { params: { confirm: true } })
    return data
  },

  // Generate AI plan for a goal (preview before creating)
  generatePlan: async (request: GoalPlanRequest): Promise<GoalPlanResponse> => {
    const { data } = await api.post<GoalPlanResponse>('/goals/plan', request)
    return data
  },
}

export default goalsApi
