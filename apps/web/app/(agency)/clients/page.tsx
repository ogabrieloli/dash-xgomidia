'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Building2, ChevronRight } from 'lucide-react'
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

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum cliente encontrado</p>
          <Link href="/clients/new" className="mt-4 text-sm text-primary hover:underline">
            Cadastrar primeiro cliente
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Operação</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Investindo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Faturamento</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.map((client, i) => (
                <tr
                  key={client.id}
                  className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                        {client.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-muted-foreground line-clamp-1">{client.operation ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${client.alreadyInvesting ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                      {client.alreadyInvesting ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-muted-foreground">
                    {client.reportedRevenue
                      ? `R$ ${parseFloat(client.reportedRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell text-muted-foreground">
                    {client._count?.adAccounts ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
