import api from './client'
import type { Task, TaskUpdateInput, SuccessResponse } from '../types'

export const tasksApi = {
  // List tasks with optional filters
  list: async (params?: {
    goal_id?: string
    status?: string
    week_start?: string
    year_week?: string
  }): Promise<Task[]> => {
    const { data } = await api.get<Task[]>('/tasks', { params })
    return data
  },

  // Get tasks for a specific week
  getWeek: async (weekStart: string): Promise<Task[]> => {
    const { data } = await api.get<Task[]>(`/tasks/week/${weekStart}`)
    return data
  },

  // Get a single task
  get: async (taskId: string): Promise<Task> => {
    const { data } = await api.get<Task>(`/tasks/${taskId}`)
    return data
  },

  // Update a task
  update: async (taskId: string, updates: TaskUpdateInput): Promise<SuccessResponse> => {
    const { data } = await api.patch<SuccessResponse>(`/tasks/${taskId}`, updates)
    return data
  },

  // Move task to a different week
  move: async (taskId: string, newWeekStart: string, newSortOrder?: number): Promise<SuccessResponse> => {
    const { data } = await api.post<SuccessResponse>(`/tasks/${taskId}/move`, {
      new_week_start: newWeekStart,
      new_sort_order: newSortOrder,
    })
    return data
  },

  // Mark task as complete
  complete: async (taskId: string): Promise<SuccessResponse> => {
    const { data } = await api.post<SuccessResponse>(`/tasks/${taskId}/complete`)
    return data
  },

  // Delete a task
  delete: async (taskId: string): Promise<SuccessResponse> => {
    const { data } = await api.delete<SuccessResponse>(`/tasks/${taskId}`)
    return data
  },
}

export default tasksApi

