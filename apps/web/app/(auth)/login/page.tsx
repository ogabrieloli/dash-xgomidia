'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido').toLowerCase().trim(),
  password: z.string().min(1, 'Senha obrigatória'),
})

type LoginForm = z.infer<typeof LoginSchema>

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setServerError(null)
    try {
      const res = await api.post<{
        data: {
          accessToken: string
          user: { id: string; email: string; role: string; agencyId: string }
        }
      }>('/auth/login', data)

      const { accessToken, user } = res.data.data

      // Configurar token no header padrão do axios
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`

      setAuth(
        { id: user.id, email: user.email, role: user.role as never, agencyId: user.agencyId },
        accessToken,
      )

      router.push('/dashboard')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Erro ao fazer login. Tente novamente.'
      setServerError(message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">XGO Midia</h1>
          <p className="mt-2 text-sm text-muted-foreground">Plataforma de Tráfego Pago</p>
        </div>

        {/* Card */}
        <div className="rounded-lg border bg-card p-8 shadow-sm">
          <h2 className="mb-6 text-xl font-semibold text-card-foreground">Entrar na plataforma</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* E-mail */}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                placeholder="seu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Senha */}
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {/* Erro do servidor */}
            {serverError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
