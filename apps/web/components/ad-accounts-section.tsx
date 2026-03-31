'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Plug, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AdAccount {
  id: string
  platform: string
  externalId: string
  name: string
  currency: string
  timezone: string
  syncStatus: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'ERROR'
  syncError: string | null
  lastSyncAt: string | null
}

const PLATFORM_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  TIKTOK_ADS: 'TikTok Ads',
  LINKEDIN_ADS: 'LinkedIn Ads',
}

const PLATFORM_COLORS: Record<string, string> = {
  META_ADS: 'bg-blue-50 text-blue-700 border-blue-200',
  GOOGLE_ADS: 'bg-red-50 text-red-700 border-red-200',
  TIKTOK_ADS: 'bg-gray-900 text-white border-gray-800',
  LINKEDIN_ADS: 'bg-sky-50 text-sky-700 border-sky-200',
}

function SyncStatusBadge({ status, error }: { status: AdAccount['syncStatus']; error: string | null }) {
  if (status === 'SYNCING') {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sincronizando
      </span>
    )
  }
  if (status === 'SUCCESS') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Sincronizado
      </span>
    )
  }
  if (status === 'ERROR') {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive" title={error ?? undefined}>
        <AlertCircle className="h-3 w-3" />
        Erro
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      Pendente
    </span>
  )
}

export function AdAccountsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['ad-accounts', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: AdAccount[] }>('/api/ad-accounts', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  const syncMutation = useMutation({
    mutationFn: async (accountId: string) => {
      setSyncingId(accountId)
      const res = await api.post(`/api/ad-accounts/${accountId}/sync`, null, {
        params: { clientId },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-accounts', clientId] })
      setSyncingId(null)
    },
    onError: () => {
      setSyncingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.delete(`/api/ad-accounts/${accountId}`, {
        params: { clientId },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-accounts', clientId] })
    },
  })

  const handleConnectMeta = () => {
    const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    window.location.href = `${apiBase}/auth/meta/connect?clientId=${clientId}`
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Contas de Anúncio</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plataformas conectadas para sincronização de métricas
          </p>
        </div>
        <button
          onClick={handleConnectMeta}
          className={cn(
            'flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50',
            'px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors',
          )}
        >
          <Plug className="h-3.5 w-3.5" />
          Conectar Meta Ads
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma conta conectada</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Conecte o Meta Ads para começar a sincronizar métricas
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'rounded border px-2 py-0.5 text-xs font-medium',
                    PLATFORM_COLORS[account.platform] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {PLATFORM_LABELS[account.platform] ?? account.platform}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.externalId}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <SyncStatusBadge status={account.syncStatus} error={account.syncError} />

                {account.lastSyncAt && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(account.lastSyncAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}

                <button
                  onClick={() => syncMutation.mutate(account.id)}
                  disabled={account.syncStatus === 'SYNCING' || syncingId === account.id}
                  title="Sincronizar agora"
                  className="rounded p-1.5 hover:bg-accent disabled:opacity-40 transition-colors"
                >
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5 text-muted-foreground',
                      syncingId === account.id && 'animate-spin',
                    )}
                  />
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Desconectar ${account.name}?`)) {
                      deleteMutation.mutate(account.id)
                    }
                  }}
                  title="Desconectar conta"
                  className="rounded p-1.5 hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
