'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, AlertCircle, Info, CheckCheck, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AiInsight {
  id: string
  type: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  body: string
  source: string
  readAt: string | null
  createdAt: string
}

const SEVERITY_CONFIG = {
  CRITICAL: {
    icon: AlertCircle,
    badge: 'bg-red-100 text-red-700 border-red-200',
    border: 'border-l-red-500',
    label: 'Crítico',
  },
  WARNING: {
    icon: AlertTriangle,
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    border: 'border-l-amber-400',
    label: 'Atenção',
  },
  INFO: {
    icon: Info,
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    border: 'border-l-blue-400',
    label: 'Info',
  },
}

export function InsightsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()

  const { data: insights, isLoading } = useQuery({
    queryKey: ['insights', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: AiInsight[] }>('/api/insights', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  const readMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/insights/${id}/read`, null, { params: { clientId } })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights', clientId] }),
  })

  const readAllMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/insights/read-all', null, { params: { clientId } })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights', clientId] }),
  })

  const unreadCount = insights?.filter((i) => !i.readAt).length ?? 0

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Insights</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todos como lidos
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : !insights || insights.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center">
          <Info className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum insight disponível</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Os alertas automáticos aparecerão aqui após o sync de métricas
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((insight) => {
            const config = SEVERITY_CONFIG[insight.severity]
            const Icon = config.icon
            const isRead = !!insight.readAt

            return (
              <div
                key={insight.id}
                className={cn(
                  'rounded-lg border bg-card border-l-4 px-4 py-3 transition-opacity',
                  config.border,
                  isRead && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5',
                      insight.severity === 'CRITICAL' && 'text-red-500',
                      insight.severity === 'WARNING' && 'text-amber-500',
                      insight.severity === 'INFO' && 'text-blue-500',
                    )} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{insight.title}</p>
                        <span className={cn('rounded border px-1.5 py-0.5 text-xs font-medium', config.badge)}>
                          {config.label}
                        </span>
                        {insight.source === 'RULES_ENGINE' && (
                          <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground border-muted">
                            Automático
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{insight.body}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  {!isRead && (
                    <button
                      onClick={() => readMutation.mutate(insight.id)}
                      disabled={readMutation.isPending}
                      title="Marcar como lido"
                      className="flex-shrink-0 rounded p-1 hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
