'use client'

import { useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Check, Loader2, AlertCircle, LayoutDashboard } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface MetaAdAccount {
    id: string
    name: string
    currency: string
    timezone_name: string
}

interface PendingResponse {
    data: {
        clientId: string
        accounts: MetaAdAccount[]
    }
}

export default function MetaSelectPage() {
    const { clientId } = useParams<{ clientId: string }>()
    const router = useRouter()
    const searchParams = useSearchParams()
    const pendingId = searchParams.get('pendingId')

    const [selectedIds, setSelectedIds] = useState<string[]>([])

    const { data, isLoading, error } = useQuery({
        queryKey: ['meta-pending', pendingId],
        queryFn: async () => {
            const res = await api.get<PendingResponse>(`/auth/meta/pending/${pendingId}`)
            return res.data.data
        },
        enabled: !!pendingId,
    })

    const confirmMutation = useMutation({
        mutationFn: async () => {
            await api.post(`/auth/meta/pending/${pendingId}/confirm`, {
                selectedExternalIds: selectedIds,
            })
        },
        onSuccess: () => {
            router.push(`/clients/${clientId}?success=meta_connected`)
        },
    })

    const toggleAccount = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
        )
    }

    if (!pendingId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-bold mb-2">ID de conexão inválido</h1>
                <p className="text-muted-foreground mb-6">Inicie o processo de conexão novamente.</p>
                <button
                    onClick={() => router.push(`/clients/${clientId}`)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Voltar para o cliente
                </button>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground">Buscando suas contas de anúncio...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-bold mb-2">Conexão expirada</h1>
                <p className="text-muted-foreground mb-6">O tempo para seleção expirou (15 min) ou a conexão já foi processada.</p>
                <button
                    onClick={() => router.push(`/clients/${clientId}`)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Tentar novamente
                </button>
            </div>
        )
    }

    const accounts = data?.accounts ?? []

    return (
        <div className="max-w-2xl mx-auto p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground mb-2">Selecionar Contas Meta</h1>
                <p className="text-sm text-muted-foreground">
                    Escolha quais contas de anúncio você deseja vincular a este cliente.
                    Apenas as contas selecionadas serão sincronizadas no dashboard.
                </p>
            </div>

            <div className="space-y-3 mb-8">
                {accounts.map((acc) => (
                    <button
                        key={acc.id}
                        onClick={() => toggleAccount(acc.id)}
                        className={cn(
                            'w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left outline-none',
                            selectedIds.includes(acc.id)
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border bg-card hover:border-muted-foreground/30',
                        )}
                    >
                        <div>
                            <p className="font-semibold text-sm text-foreground">{acc.name}</p>
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">ID: {acc.id}</span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">{acc.currency}</span>
                            </div>
                        </div>
                        <div className={cn(
                            'h-6 w-6 rounded-full border flex items-center justify-center transition-colors',
                            selectedIds.includes(acc.id)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-muted-foreground/20'
                        )}>
                            {selectedIds.includes(acc.id) && <Check className="h-4 w-4" />}
                        </div>
                    </button>
                ))}

                {accounts.length === 0 && (
                    <div className="py-12 text-center bg-muted/20 rounded-xl border border-dashed">
                        <LayoutDashboard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Nenhuma conta ativa encontrada nesta conexão.</p>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-6">
                <button
                    onClick={() => router.push(`/clients/${clientId}`)}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={() => confirmMutation.mutate()}
                    disabled={selectedIds.length === 0 || confirmMutation.isPending}
                    className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                >
                    {confirmMutation.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Conectando...
                        </>
                    ) : (
                        `Vinculando ${selectedIds.length} conta${selectedIds.length !== 1 ? 's' : ''}`
                    )}
                </button>
            </div>
        </div>
    )
}
