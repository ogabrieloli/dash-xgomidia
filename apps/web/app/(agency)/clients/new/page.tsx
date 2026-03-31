'use client'

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
    .regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens')
    .transform((v) => v.toLowerCase().trim()),
})

type CreateClientForm = z.infer<typeof CreateClientSchema>

export default function NewClientPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientForm>({
    resolver: zodResolver(CreateClientSchema),
  })

  // Auto-gerar slug a partir do nome
  const nameValue = watch('name')
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

  const mutation = useMutation({
    mutationFn: async (data: CreateClientForm) => {
      const res = await api.post('/api/clients', data)
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
              {...register('name', {
                onChange: handleNameChange,
              })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
            <p className="text-xs text-muted-foreground">
              Usado em URLs. Apenas letras minúsculas, números e hífens.
            </p>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
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
