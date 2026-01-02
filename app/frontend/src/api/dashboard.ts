import api from './client'
import type { DashboardData, WeekSummary, Task } from '../types'

export const dashboardApi = {
  // Get main dashboard data
  get: async (): Promise<DashboardData> => {
    const { data } = await api.get<DashboardData>('/dashboard')
    return data
  },

  // Get weekly summary for past N weeks
  getWeeklySummary: async (weeks: number = 12): Promise<WeekSummary[]> => {
    const { data } = await api.get<WeekSummary[]>('/dashboard/weekly-summary', {
      params: { weeks },
    })
    return data
  },

  // Get overdue tasks
  getOverdue: async (limit: number = 50): Promise<Task[]> => {
    const { data } = await api.get<Task[]>('/dashboard/overdue', {
      params: { limit },
    })
    return data
  },

  // Get calendar view
  getCalendar: async (startDate: string, endDate: string) => {
    const { data } = await api.get('/dashboard/calendar', {
      params: { start_date: startDate, end_date: endDate },
    })
    return data
  },
}

export default dashboardApi

