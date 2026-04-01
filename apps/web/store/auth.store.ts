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
  _hasHydrated: boolean
  setAuth: (user: AuthUser, token: string) => void
  setToken: (token: string) => void
  logout: () => void
  setHasHydrated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      setToken: (accessToken) =>
        set((state) => ({ ...state, accessToken })),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),

      setHasHydrated: (value) =>
        set({ _hasHydrated: value }),
    }),
    {
      name: 'xgo-auth',
      // Só persistir user e isAuthenticated — token expira em 15min, não persistir
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
