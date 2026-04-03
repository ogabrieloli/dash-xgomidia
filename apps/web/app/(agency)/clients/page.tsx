'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Building2, ArrowRight } from 'lucide-react'
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

function ClientAvatar({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10 text-base' : 'h-12 w-12 text-lg'

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClass} rounded-xl object-cover border border-[#E8E2D8] flex-shrink-0`}
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
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: '#C8432A' }}
    >
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

  const activeCount = data?.filter((c) => c.alreadyInvesting).length ?? 0

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-2xl font-bold text-stone-900">Clientes</h1>
            {data && (
              <span className="text-stone-400 text-sm font-normal">
                · {activeCount} ativo{activeCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-stone-400 mt-0.5">Gerencie sua carteira de clientes</p>
        </div>
        <Link
          href="/clients/new"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#C8432A' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#B03A24' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#C8432A' }}
        >
          <Plus className="h-4 w-4" />
          Novo cliente
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input
          type="text"
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E2D8] bg-white text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C8432A]/30 focus:border-[#C8432A]"
        />
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-white border border-[#E8E2D8] animate-pulse" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-stone-300" />
          </div>
          <p className="text-sm font-medium text-stone-500">Nenhum cliente encontrado</p>
          <Link
            href="/clients/new"
            className="mt-4 text-sm font-medium transition-colors"
            style={{ color: '#C8432A' }}
          >
            Cadastrar primeiro cliente →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {data?.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="group bg-white rounded-xl border border-[#E8E2D8] shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden"
            >
              {/* Card body */}
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <ClientAvatar name={client.name} logoUrl={client.logoUrl} />
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-stone-900 truncate leading-snug">{client.name}</p>
                      <p className="text-xs text-stone-400 truncate">/{client.slug}</p>
                    </div>
                  </div>
                  {/* Status dot */}
                  <span
                    className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                      client.alreadyInvesting ? 'bg-green-500' : 'bg-stone-300'
                    }`}
                    title={client.alreadyInvesting ? 'Investindo' : 'Sem investimento'}
                  />
                </div>

                <p className="text-sm text-stone-500 line-clamp-2 min-h-[2.5rem]">
                  {client.operation ?? 'Sem descrição do negócio'}
                </p>
              </div>

              {/* Card footer */}
              <div className="px-5 py-3 border-t border-[#F5F0E8] flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  {(client._count?.adAccounts ?? 0) > 0 && (
                    <span>
                      {client._count?.adAccounts} conta{(client._count?.adAccounts ?? 0) !== 1 ? 's' : ''}
                    </span>
                  )}
                  {client.reportedRevenue && (
                    <span>
                      R$ {parseFloat(client.reportedRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês
                    </span>
                  )}
                </div>
                <ArrowRight
                  className="h-4 w-4 text-stone-300 group-hover:text-[#C8432A] group-hover:translate-x-0.5 transition-all"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
