'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

/**
 * Hook para usar em componentes que precisam do usuário autenticado.
 * Faz silent refresh ao montar quando o accessToken não está em memória
 * (ex: após page refresh), restaurando a sessão antes de qualquer chamada de API.
 */
export function useAuth() {
  const { user, accessToken, isAuthenticated, setToken, logout } = useAuthStore()
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(isAuthenticated && !accessToken)
  const initRan = useRef(false)

  useEffect(() => {
    // Já tem token em memória — configurar axios e pronto
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      setIsInitializing(false)
      return
    }

    // Não autenticado — redirecionar
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }

    // isAuthenticated mas sem token em memória (page refresh) — silent refresh
    if (initRan.current) return
    initRan.current = true

    api
      .post<{ data: { accessToken: string } }>('/auth/refresh')
      .then(({ data }) => {
        const newToken = data.data.accessToken
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
        setToken(newToken)
      })
      .catch(() => {
        logout()
        router.replace('/login')
      })
      .finally(() => {
        setIsInitializing(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Manter axios sincronizado quando o interceptor renovar o token
  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
    }
  }, [accessToken])

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

  return { user, isAuthenticated, isInitializing, logout: handleLogout }
}
