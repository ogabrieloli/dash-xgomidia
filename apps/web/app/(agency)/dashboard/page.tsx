'use client'

import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker, type DateRangeValue } from '@/components/date-range-picker'

interface DerivedMetrics {
  ctr: number
  cpc: number
  cpa: number
  roas: number
  cpm: number
}

interface Totals {
  impressions: number
  clicks: number
  spend: string
  conversions: number
  revenue: string
  derived: DerivedMetrics
}

interface TopClient {
  clientId: string
  clientName: string
  spend: string
  revenue: string
  roas: number
}

interface AgencySummary {
  totals: Totals
  topClients: TopClient[]
  totalClients: number
  averageInvestment: number
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['agency-summary', dateRange],
    queryFn: async () => {
      const res = await api.get<{ data: AgencySummary }>('/api/metrics/agency-summary', {
        params: { dateFrom: dateRange.from, dateTo: dateRange.to },
      })
      return res.data.data
    },
  })

  const totals = data?.totals
  const spend = parseFloat(totals?.spend ?? '0')
  const revenue = parseFloat(totals?.revenue ?? '0')

  const clientChartData = (data?.topClients ?? []).slice(0, 8).map((c) => ({
    name: c.clientName.length > 14 ? c.clientName.slice(0, 14) + '…' : c.clientName,
    spend: parseFloat(c.spend),
    revenue: parseFloat(c.revenue),
  }))

  return (
    <div className="p-8 space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">Dashboard</h1>
          <p className="text-sm text-stone-400 mt-0.5">Visão consolidada da agência</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Hero KPIs — 5 em row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Investimento Total"
          value={formatCurrency(spend)}
          loading={isLoading}
          accent
        />
        <KpiCard
          label="Receita Total"
          value={formatCurrency(revenue)}
          loading={isLoading}
          accent
        />
        <KpiCard
          label="ROAS Médio"
          value={totals ? `${totals.derived.roas.toFixed(2)}x` : '—'}
          sub="Retorno sobre invest."
          loading={isLoading}
        />
        <KpiCard
          label="Conversões"
          value={totals ? formatNumber(totals.conversions) : '—'}
          sub={totals ? `CPA: ${formatCurrency(totals.derived.cpa)}` : undefined}
          loading={isLoading}
        />
        <KpiCard
          label="Clientes Ativos"
          value={data ? String(data.totalClients) : '—'}
          sub={data ? `Média ${formatCurrency(data.averageInvestment)}/cliente` : undefined}
          loading={isLoading}
        />
      </div>

      {/* Chart + Top Clients side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Bar chart — col-span-3 */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-[#E8E2D8] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-stone-700 mb-5">Investimento por Cliente</h2>
          {isLoading ? (
            <div className="h-64 rounded-lg bg-stone-50 animate-pulse" />
          ) : clientChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={clientChartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'spend' ? 'Investimento' : 'Receita',
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    border: '1px solid #E8E2D8',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  }}
                />
                <Bar dataKey="spend" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" fill="#3B82F640" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-stone-400">
              Sem dados para o período
            </div>
          )}
        </div>

        {/* Top clients table — col-span-2 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E8E2D8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F0EBE0]">
            <h2 className="text-sm font-semibold text-stone-700">Top Performance</h2>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-3 w-28 rounded bg-stone-100 animate-pulse" />
                  <div className="h-3 w-12 rounded bg-stone-100 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (data?.topClients ?? []).length > 0 ? (
            <div className="divide-y divide-[#F5F0E8]">
              {data!.topClients.slice(0, 8).map((client, idx) => (
                <div key={client.clientId} className="flex items-center justify-between px-5 py-3 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-stone-300 w-4 tabular-nums">{idx + 1}</span>
                    <Link
                      href={`/clients/${client.clientId}`}
                      className="text-sm font-medium text-stone-800 hover:text-[#3B82F6] transition-colors truncate"
                    >
                      {client.clientName}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-stone-400 tabular-nums hidden sm:block">
                      {formatCurrency(parseFloat(client.spend))}
                    </span>
                    <span
                      className={
                        'text-sm font-semibold tabular-nums ' +
                        (client.roas >= 3
                          ? 'text-green-600'
                          : client.roas >= 1
                          ? 'text-amber-600'
                          : 'text-red-600')
                      }
                    >
                      {client.roas.toFixed(1)}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-stone-400">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Impressões"
          value={totals ? formatNumber(totals.impressions) : '—'}
          sub={totals ? `CPM: ${formatCurrency(totals.derived.cpm)}` : undefined}
          loading={isLoading}
        />
        <KpiCard
          label="Cliques"
          value={totals ? formatNumber(totals.clicks) : '—'}
          sub={totals ? `CTR: ${formatPercent(totals.derived.ctr)}` : undefined}
          loading={isLoading}
        />
        <KpiCard
          label="CPC Médio"
          value={totals ? formatCurrency(totals.derived.cpc) : '—'}
          loading={isLoading}
        />
        <KpiCard
          label="CPA Médio"
          value={totals ? formatCurrency(totals.derived.cpa) : '—'}
          loading={isLoading}
        />
      </div>

      {/* Empty state */}
      {!isLoading && (data?.topClients ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E8E2D8] bg-white p-12 text-center">
          <p className="text-sm text-stone-400">
            Nenhuma métrica disponível para o período selecionado.
          </p>
          <p className="text-xs text-stone-300 mt-1">
            Conecte contas de anúncio e aguarde o sync.
          </p>
        </div>
      )}
    </div>
  )
}
