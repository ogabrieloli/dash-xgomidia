'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

/**
 * Hook para componentes que precisam do usuário autenticado.
 *
 * Fluxo no page refresh:
 *  1. Zustand ainda não hidratou → isInitializing = true (spinner no layout)
 *  2. Zustand hidrata → _hasHydrated = true, isAuthenticated = true, accessToken = null
 *  3. useEffect dispara: chama /auth/refresh com o cookie httpOnly
 *  4. Token restaurado → componentes renderizam normalmente
 *  5. Se refresh falhar → logout e redirect para /login
 */
export function useAuth() {
  const { user, accessToken, isAuthenticated, _hasHydrated, setToken, logout } = useAuthStore()
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(true)
  const initRan = useRef(false)

  useEffect(() => {
    // Aguardar hidratação do Zustand (carregamento do localStorage)
    if (!_hasHydrated) return

    // Não autenticado após hidratar → ir para login
    if (!isAuthenticated) {
      router.replace('/login')
      setIsInitializing(false)
      return
    }

    // Já tem token em memória (ex: login recente sem refresh de página)
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      setIsInitializing(false)
      return
    }

    // isAuthenticated mas sem token (page refresh) → silent refresh via cookie
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
  }, [_hasHydrated, isAuthenticated, accessToken, router, setToken, logout])

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
