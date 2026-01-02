import api from './client'

export interface RebalanceRequest {
  current_week_hours: number
  future_week_hours: number
  use_ai: boolean
}

export interface RebalanceChange {
  action: string
  task_id: string
  task_title: string
  from_week: string
  to_week: string
  target_week_start: string
  reason: string
}

export interface OverloadedWeek {
  week: string
  hours: number
  capacity: number
  excess: number
  task_count: number
}

export interface RebalancePlan {
  success: boolean
  message: string
  recommendations: string[]
  changes: RebalanceChange[]
  summary: {
    hours_per_week: number
    max_units_per_week: number
    total_tasks_analyzed: number
    tasks_to_move: number
    ai_powered?: boolean
    overloaded_weeks?: OverloadedWeek[]
  }
}

export interface ApplyRequest {
  changes: RebalanceChange[]
}

export interface ApplyResponse {
  success: boolean
  applied: Array<{
    task_id: string
    task_title: string
    from_week: string
    to_week: string
  }>
  errors: Array<{
    task_id: string
    error: string
  }>
  total_applied: number
  total_errors: number
}

export const rebalanceApi = {
  calculate: async (
    currentWeekHours: number,
    futureWeekHours: number,
    useAi: boolean = true
  ): Promise<RebalancePlan> => {
    const { data } = await api.post<RebalancePlan>('/rebalance/calculate', {
      current_week_hours: currentWeekHours,
      future_week_hours: futureWeekHours,
      use_ai: useAi
    })
    return data
  },

  apply: async (changes: RebalanceChange[]): Promise<ApplyResponse> => {
    const { data } = await api.post<ApplyResponse>('/rebalance/apply', { changes })
    return data
  }
}

export default rebalanceApi

