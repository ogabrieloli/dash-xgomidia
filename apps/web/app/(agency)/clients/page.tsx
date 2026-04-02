'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Building2 } from 'lucide-react'
import { api } from '@/lib/api'

interface Client {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  operation: string | null
  alreadyInvesting: boolean
  initialInvestment: string | null
  reportedRevenue: string | null
  _count?: { adAccounts: number }
}

function ClientAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-12 w-12 rounded-full object-cover border border-border flex-shrink-0"
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement
          target.style.display = 'none'
          if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'flex'
          }
        }}
      />
    )
  }
  return (
    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
      {name[0]?.toUpperCase()}
    </div>
  )
}

export default function ClientsPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: async () => {
      const res = await api.get<{ data: Client[] }>('/api/clients', {
        params: search ? { search } : undefined,
      })
      return res.data.data
    },
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.length ?? 0} cliente{data?.length !== 1 ? 's' : ''} cadastrado{data?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/clients/new"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum cliente encontrado</p>
          <Link href="/clients/new" className="mt-4 text-sm text-primary hover:underline">
            Cadastrar primeiro cliente
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="group rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all flex flex-col gap-4"
            >
              {/* Top: avatar + name */}
              <div className="flex items-center gap-3">
                <ClientAvatar name={client.name} logoUrl={client.logoUrl} />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground truncate">/{client.slug}</p>
                </div>
              </div>

              {/* Operation description */}
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1 min-h-[2.5rem]">
                {client.operation ?? 'Sem descrição do negócio'}
              </p>

              {/* Footer: badges */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  client.alreadyInvesting
                    ? 'bg-green-500/15 text-green-600'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {client.alreadyInvesting ? 'Investindo' : 'Sem investimento'}
                </span>

                {(client._count?.adAccounts ?? 0) > 0 && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-500/10 text-blue-600 font-medium">
                    {client._count?.adAccounts} conta{(client._count?.adAccounts ?? 0) !== 1 ? 's' : ''}
                  </span>
                )}

                {client.reportedRevenue && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    R$ {parseFloat(client.reportedRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/m
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
