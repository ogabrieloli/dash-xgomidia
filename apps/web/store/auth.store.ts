import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserRole } from '@xgo/shared-types'

interface AuthUser {
  id: string
  email: string
  role: UserRole
  agencyId: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser, token: string) => void
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      setToken: (accessToken) =>
        set((state) => ({ ...state, accessToken })),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'xgo-auth',
      // Só persistir user e isAuthenticated — não o token (ele expira em 15min)
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
