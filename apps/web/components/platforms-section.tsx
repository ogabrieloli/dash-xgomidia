'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Clock, AlertCircle, Loader2, RefreshCw, Trash2,
  Plug, ExternalLink, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AdAccount {
  id: string
  platform: string
  externalId: string
  name: string
  syncStatus: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'ERROR'
  syncError: string | null
  lastSyncAt: string | null
}

interface MetaAdAccount {
  id: string
  name: string
  currency: string
  timezone_name: string
  account_status: number
}

function SyncStatusBadge({ status, error }: { status: AdAccount['syncStatus']; error: string | null }) {
  if (status === 'SYNCING') return <span className="flex items-center gap-1 text-xs text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />Sincronizando</span>
  if (status === 'SUCCESS') return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />Sincronizado</span>
  if (status === 'ERROR') return <span className="flex items-center gap-1 text-xs text-destructive" title={error ?? undefined}><AlertCircle className="h-3 w-3" />Erro</span>
  return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />Pendente</span>
}

const MOCK_PLATFORMS = [
  { key: 'GOOGLE_ADS', label: 'Google Ads', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900' },
  { key: 'TIKTOK_ADS', label: 'TikTok Ads', color: 'bg-gray-900 text-white border-gray-700' },
  { key: 'GOOGLE_ANALYTICS', label: 'Google Analytics', color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900' },
]

interface PlatformsSectionProps {
  clientId: string
  pendingId?: string | null
}

export function PlatformsSection({ clientId, pendingId }: PlatformsSectionProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [syncingId, setSyncingId] = useState<string | null>(null)

  // Modal de seleção de contas
  const [showSelectionModal, setShowSelectionModal] = useState(false)
  const [selectedExternalIds, setSelectedExternalIds] = useState<Set<string>>(new Set())

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['ad-accounts', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: AdAccount[] }>('/api/ad-accounts', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  // Buscar contas disponíveis quando há pendingId
  const { data: pendingData, isLoading: isPendingLoading } = useQuery({
    queryKey: ['meta-pending', pendingId],
    queryFn: async () => {
      const res = await api.get<{ data: { clientId: string; accounts: MetaAdAccount[] } }>(
        `/auth/meta/pending/${pendingId}`,
      )
      return res.data.data
    },
    enabled: !!pendingId,
    retry: false,
  })

  // Abrir modal quando pendingData chegar
  useEffect(() => {
    if (pendingData?.accounts?.length) {
      // Pré-selecionar todas as contas
      setSelectedExternalIds(new Set(pendingData.accounts.map((a) => a.id)))
      setShowSelectionModal(true)
    }
  }, [pendingData])

  const syncMutation = useMutation({
    mutationFn: async (accountId: string) => {
      setSyncingId(accountId)
      await api.post(`/api/ad-accounts/${accountId}/sync`, null, { params: { clientId } })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-accounts', clientId] })
      setSyncingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.delete(`/api/ad-accounts/${accountId}`, { params: { clientId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-accounts', clientId] })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { connectedCount: number } }>(
        `/auth/meta/pending/${pendingId}/confirm`,
        { selectedExternalIds: Array.from(selectedExternalIds) },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-accounts', clientId] })
      setShowSelectionModal(false)
      // Limpar o query param da URL
      router.replace(`/clients/${clientId}`)
    },
  })

  const handleConnectMeta = async () => {
    try {
      const res = await api.get<{ url: string }>('/auth/meta/connect', { params: { clientId } })
      window.location.href = res.data.url
    } catch {
      alert('Erro ao iniciar conexão com Meta Ads. Tente novamente.')
    }
  }

  const handleCloseModal = () => {
    setShowSelectionModal(false)
    router.replace(`/clients/${clientId}`)
  }

  const toggleAccount = (externalId: string) => {
    setSelectedExternalIds((prev) => {
      const next = new Set(prev)
      if (next.has(externalId)) {
        next.delete(externalId)
      } else {
        next.add(externalId)
      }
      return next
    })
  }

  const metaAccounts = accounts?.filter((a) => a.platform === 'META_ADS') ?? []

  return (
    <>
      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Plataformas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Conexões com plataformas de anúncio e analytics</p>
        </div>

        <div className="space-y-3">
          {/* Meta Ads — real */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="rounded border px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900">
                  Meta Ads
                </span>
                <span className="text-xs text-muted-foreground">{metaAccounts.length} conta{metaAccounts.length !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={handleConnectMeta}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50',
                  'px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-900 transition-colors',
                )}
              >
                <Plug className="h-3 w-3" />
                Conectar via OAuth
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            {isLoading ? (
              <div className="px-4 py-3 space-y-2">
                <div className="h-10 rounded bg-muted animate-pulse" />
              </div>
            ) : metaAccounts.length === 0 ? (
              <div className="px-4 py-4 text-center">
                <p className="text-xs text-muted-foreground">Nenhuma conta Meta Ads conectada</p>
              </div>
            ) : (
              <div className="divide-y">
                {metaAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{account.name}</p>
                      <p className="text-xs text-muted-foreground">{account.externalId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SyncStatusBadge status={account.syncStatus} error={account.syncError} />
                      {account.lastSyncAt && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {new Date(account.lastSyncAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <button
                        onClick={() => syncMutation.mutate(account.id)}
                        disabled={account.syncStatus === 'SYNCING' || syncingId === account.id}
                        title="Sincronizar agora"
                        className="rounded p-1 hover:bg-accent disabled:opacity-40 transition-colors"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', syncingId === account.id && 'animate-spin')} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Desconectar ${account.name}?`)) deleteMutation.mutate(account.id) }}
                        title="Desconectar"
                        className="rounded p-1 hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plataformas mockadas */}
          {MOCK_PLATFORMS.map((platform) => (
            <div key={platform.key} className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn('rounded border px-2 py-0.5 text-xs font-medium', platform.color)}>
                    {platform.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground border border-dashed rounded px-2.5 py-1">
                  Em breve
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de seleção de contas */}
      {showSelectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Selecionar contas Meta Ads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Escolha quais contas deseja vincular a este cliente</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="rounded p-1 hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="px-5 py-4">
              {isPendingLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(pendingData?.accounts ?? []).map((account) => (
                    <label
                      key={account.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
                        selectedExternalIds.has(account.id)
                          ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'hover:bg-accent/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExternalIds.has(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.id} · {account.currency}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {selectedExternalIds.size} conta{selectedExternalIds.size !== 1 ? 's' : ''} selecionada{selectedExternalIds.size !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleCloseModal}
                  className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmMutation.mutate()}
                  disabled={selectedExternalIds.size === 0 || confirmMutation.isPending}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {confirmMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Vincular selecionadas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
