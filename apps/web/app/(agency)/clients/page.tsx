'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Client {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  _count?: { projects: number }
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

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg border bg-card animate-pulse" />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className={cn(
                'flex items-center gap-4 rounded-lg border bg-card p-4',
                'hover:border-primary/50 hover:shadow-sm transition-all',
              )}
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                {client.name[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.slug}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
