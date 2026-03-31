'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker, type DateRangeValue } from '@/components/date-range-picker'
import { InsightsPanel } from '@/components/insights-panel'
import { AiChat } from '@/components/ai-chat'
import { useState } from 'react'
import { subDays, format } from 'date-fns'

interface MetricSummary {
  totalSpend: string
  totalRevenue: string
  totalImpressions: string
  totalClicks: string
  totalConversions: number
  roas: number
  ctr: number
  cpa: number
  cpm: number
}

interface Strategy {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  strategies: Strategy[]
}

interface ClientInfo {
  id: string
  name: string
  slug: string
  projects?: Project[]
}

interface MeResponse {
  id: string
  email: string
  role: string
  accessibleClients: ClientInfo[]
}

export default function ClientPortalDashboard() {
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<{ data: MeResponse }>('/auth/me')
      return res.data.data
    },
  })

  const clientId = me?.accessibleClients[0]?.id

  // Buscar projetos do cliente para obter a primeira estratégia (para o chat)
  const { data: clientDetail } = useQuery({
    queryKey: ['client-detail-portal', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const res = await api.get<{ data: ClientInfo }>(`/api/clients/${clientId}`)
      return res.data.data
    },
  })

  // Primeira estratégia disponível para o chat
  const firstStrategyId = clientDetail?.projects?.[0]?.strategies?.[0]?.id ?? null

  const { data: summary, isLoading } = useQuery({
    queryKey: ['client-summary', clientId, dateRange],
    enabled: !!clientId,
    queryFn: async () => {
      const res = await api.get<{ data: MetricSummary }>('/api/metrics/summary', {
        params: {
          clientId,
          from: dateRange.from,
          to: dateRange.to,
        },
      })
      return res.data.data
    },
  })

  const clientName = me?.accessibleClients[0]?.name ?? 'Meu cliente'

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{clientName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão geral das campanhas</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Investimento"
            value={`R$ ${Number(summary.totalSpend).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          />
          <KpiCard
            label="ROAS"
            value={`${summary.roas.toFixed(2)}x`}
          />
          <KpiCard
            label="CTR"
            value={`${summary.ctr.toFixed(2)}%`}
          />
          <KpiCard
            label="Conversões"
            value={summary.totalConversions.toString()}
          />
        </div>
      ) : null}

      {/* Insights de IA — visíveis para o cliente */}
      {clientId && (
        <InsightsPanel clientId={clientId} />
      )}

      {/* Chat de IA — disponível se houver uma estratégia */}
      {clientId && firstStrategyId && (
        <AiChat strategyId={firstStrategyId} clientId={clientId} />
      )}

      {/* Link para relatórios */}
      {clientId && (
        <div className="rounded-lg border bg-card p-6 mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Relatórios disponíveis</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Acesse os relatórios PDF e PPT gerados pela sua agência
              </p>
            </div>
            <Link
              href="/portal/reports"
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Ver relatórios
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
