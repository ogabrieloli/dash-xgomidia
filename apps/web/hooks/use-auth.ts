'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

/**
 * Hook para usar em componentes que precisam do usuário autenticado.
 * Redireciona para /login se não autenticado.
 */
export function useAuth() {
  const { user, accessToken, isAuthenticated, logout } = useAuthStore()
  const router = useRouter()

  // Configurar axios com o token atual sempre que mudar
  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }, [accessToken])

  // Redirecionar se não autenticado
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, router])

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Ignorar erro no logout
    } finally {
      logout()
      router.push('/login')
    }
  }

  return { user, isAuthenticated, logout: handleLogout }
}
