import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'

// API base URL - uses proxy in development
const API_BASE = '/api'

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 90000, // 90 seconds for LLM calls
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // In Databricks Apps, auth is handled automatically
    // For local dev, we can add dev headers
    if (import.meta.env.DEV) {
      config.headers['X-Dev-Email'] = 'dev@example.com'
      config.headers['X-Dev-User'] = 'Developer'
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const message = error.response?.data?.detail || error.message || 'Something went wrong'
    
    // Show error toast for non-auth errors
    if (error.response?.status !== 401) {
      toast.error(message)
    }
    
    return Promise.reject(error)
  }
)

export default api

