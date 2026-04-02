'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const CreateClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).trim(),
  slug: z
    .string()
    .min(2, 'Slug deve ter pelo menos 2 caracteres')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
  logoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  operation: z.string().max(500).optional(),
  alreadyInvesting: z.boolean().default(false),
  initialInvestment: z.string().optional(),
  reportedRevenue: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

type CreateClientForm = z.infer<typeof CreateClientSchema>

export default function NewClientPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [investingToggle, setInvestingToggle] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientForm>({
    resolver: zodResolver(CreateClientSchema),
    defaultValues: { alreadyInvesting: false },
  })

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
    setValue('slug', slug)
  }

  const handleInvestingToggle = (val: boolean) => {
    setInvestingToggle(val)
    setValue('alreadyInvesting', val)
  }

  const mutation = useMutation({
    mutationFn: async (data: CreateClientForm) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        slug: data.slug,
        alreadyInvesting: data.alreadyInvesting,
      }
      if (data.logoUrl) payload['logoUrl'] = data.logoUrl
      if (data.operation) payload['operation'] = data.operation
      if (data.initialInvestment) payload['initialInvestment'] = parseFloat(data.initialInvestment)
      if (data.reportedRevenue) payload['reportedRevenue'] = parseFloat(data.reportedRevenue)
      if (data.notes) payload['notes'] = data.notes

      const res = await api.post('/api/clients', payload)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      router.push('/clients')
    },
  })

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Novo Cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">Cadastre um novo cliente na plataforma</p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="space-y-5"
        >
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              Nome do cliente <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Empresa ABC"
              {...register('name', { onChange: handleNameChange })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Logo URL */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Logo (URL)</label>
            <div className="flex items-center gap-3">
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Preview"
                  className="h-12 w-12 rounded-full object-cover border border-border flex-shrink-0"
                  onError={() => setLogoPreview('')}
                />
              )}
              {!logoPreview && (
                <div className="h-12 w-12 rounded-full bg-muted border border-dashed border-input flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                  Logo
                </div>
              )}
              <input
                type="url"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://exemplo.com/logo.png"
                {...register('logoUrl', {
                  onChange: (e) => setLogoPreview(e.target.value),
                })}
              />
            </div>
            {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl.message}</p>}
            <p className="text-xs text-muted-foreground">Opcional. Cole a URL pública da logo do cliente.</p>
          </div>

          {/* Slug */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              Slug <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="empresa-abc"
              {...register('slug')}
            />
            <p className="text-xs text-muted-foreground">Usado em URLs. Apenas letras minúsculas, números e hífens.</p>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          {/* Operação */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">O que é o negócio?</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Descreva brevemente a operação do cliente..."
              {...register('operation')}
            />
          </div>

          {/* Já investe em tráfego */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Já investe em tráfego pago?</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleInvestingToggle(!investingToggle)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  investingToggle ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    investingToggle ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">{investingToggle ? 'Sim' : 'Não'}</span>
            </div>
          </div>

          {/* Valor inicial — só aparece se investe */}
          {investingToggle && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Valor de investimento mensal (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0,00"
                {...register('initialInvestment')}
              />
            </div>
          )}

          {/* Faturamento */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Faturamento relatado (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0,00"
              {...register('reportedRevenue')}
            />
            <p className="text-xs text-muted-foreground">Opcional. Faturamento mensal informado pelo cliente.</p>
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Notas internas</label>
            <textarea
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Observações, contexto, requisitos especiais..."
              {...register('notes')}
            />
          </div>

          {/* Erro do servidor */}
          {mutation.isError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Erro ao criar cliente'}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Criando...' : 'Criar cliente'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md border border-input bg-background px-6 py-2 text-sm hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
