import axios from 'axios'
import type { ApiResponse, ApiError } from '@xgo/shared-types'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // necessário para enviar o cookie de refresh token
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para renovar access token automaticamente
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await api.post<{ data: { accessToken: string } }>('/auth/refresh')
        const newToken = data.data.accessToken

        // Atualizar token no store
        if (typeof window !== 'undefined') {
          const { useAuthStore } = await import('../store/auth.store')
          useAuthStore.getState().setToken(newToken)
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        processQueue(null, newToken)

        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export type { ApiResponse, ApiError }
