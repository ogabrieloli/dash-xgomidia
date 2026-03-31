'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Zap,
  Users,
  Settings,
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface TimelineEntry {
  id: string
  type: 'ACTION' | 'MEETING' | 'OPTIMIZATION' | 'NOTE' | 'ALERT'
  title: string
  body: string
  occurredAt: string
  author: { id: string; email: string }
}

const ENTRY_TYPES = [
  { value: 'ACTION', label: 'Ação', icon: Zap },
  { value: 'MEETING', label: 'Reunião', icon: Users },
  { value: 'OPTIMIZATION', label: 'Otimização', icon: Settings },
  { value: 'NOTE', label: 'Nota', icon: FileText },
] as const

const TYPE_STYLE: Record<TimelineEntry['type'], { icon: React.ElementType; color: string }> = {
  ACTION: { icon: Zap, color: 'text-purple-500 bg-purple-50 border-purple-200' },
  MEETING: { icon: Users, color: 'text-blue-500 bg-blue-50 border-blue-200' },
  OPTIMIZATION: { icon: Settings, color: 'text-green-500 bg-green-50 border-green-200' },
  NOTE: { icon: FileText, color: 'text-gray-500 bg-gray-50 border-gray-200' },
  ALERT: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50 border-amber-200' },
}

const CreateEntrySchema = z.object({
  type: z.enum(['ACTION', 'MEETING', 'OPTIMIZATION', 'NOTE']),
  title: z.string().min(2, 'Mínimo 2 caracteres').max(200).trim(),
  body: z.string().max(2000).optional().default(''),
})
type CreateEntryForm = z.infer<typeof CreateEntrySchema>

export function TimelineFeed({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['timeline', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: TimelineEntry[] }>('/api/timeline', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  const form = useForm<CreateEntryForm>({
    resolver: zodResolver(CreateEntrySchema),
    defaultValues: { type: 'ACTION', body: '' },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreateEntryForm) => {
      await api.post('/api/timeline', { ...data, clientId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', clientId] })
      setShowForm(false)
      form.reset()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/timeline/${id}`, { params: { clientId } })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeline', clientId] }),
  })

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Linha do Tempo</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova entrada
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-4 rounded-lg border bg-card p-4">
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-3"
          >
            <div className="flex gap-2 flex-wrap">
              {ENTRY_TYPES.map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    'flex items-center gap-1.5 cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.watch('type') === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    className="sr-only"
                    {...form.register('type')}
                  />
                  {label}
                </label>
              ))}
            </div>

            <input
              type="text"
              placeholder="Título *"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}

            <textarea
              placeholder="Detalhes (opcional)"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              {...form.register('body')}
            />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); form.reset() }}
                className="rounded-md border border-input px-4 py-1.5 text-xs hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : !entries || entries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma entrada registrada</p>
        </div>
      ) : (
        <div className="relative">
          {/* Linha vertical */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-3 pl-10">
            {entries.map((entry) => {
              const style = TYPE_STYLE[entry.type]
              const Icon = style.icon

              return (
                <div key={entry.id} className="relative">
                  {/* Dot */}
                  <div className={cn(
                    'absolute -left-[1.625rem] flex h-5 w-5 items-center justify-center rounded-full border',
                    style.color,
                  )}>
                    <Icon className="h-2.5 w-2.5" />
                  </div>

                  <div className="rounded-lg border bg-card px-4 py-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{entry.title}</p>
                        </div>
                        {entry.body && (
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {format(new Date(entry.occurredAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                          {' · '}
                          <span>{entry.author.email}</span>
                        </p>
                      </div>

                      {entry.type !== 'ALERT' && (
                        <button
                          onClick={() => deleteMutation.mutate(entry.id)}
                          className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-destructive/10 transition-all"
                          title="Remover entrada"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
