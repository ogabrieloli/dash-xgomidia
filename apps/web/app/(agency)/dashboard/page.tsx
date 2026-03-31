'use client'

import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
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

  // Prepare chart data from topClients
  const clientChartData = (data?.topClients ?? []).slice(0, 8).map((c) => ({
    name: c.clientName.length > 14 ? c.clientName.slice(0, 14) + '…' : c.clientName,
    spend: parseFloat(c.spend),
    revenue: parseFloat(c.revenue),
  }))

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão consolidada da agência</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Investimento Total"
          value={formatCurrency(spend)}
          loading={isLoading}
        />
        <KpiCard
          label="Receita Total"
          value={formatCurrency(revenue)}
          loading={isLoading}
        />
        <KpiCard
          label="ROAS Médio"
          value={totals ? `${totals.derived.roas.toFixed(2)}x` : '—'}
          sub="Retorno sobre investimento"
          loading={isLoading}
        />
        <KpiCard
          label="Conversões"
          value={totals ? formatNumber(totals.conversions) : '—'}
          sub={totals ? `CPA: ${formatCurrency(totals.derived.cpa)}` : undefined}
          loading={isLoading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
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
      </div>

      {/* Top Clients Chart */}
      {!isLoading && clientChartData.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Investimento por Cliente</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={clientChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                }
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'spend' ? 'Investimento' : 'Receita',
                ]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                formatter={(value) => (value === 'spend' ? 'Investimento' : 'Receita')}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" fill="hsl(var(--primary) / 0.3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Clients Table */}
      {!isLoading && (data?.topClients ?? []).length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-foreground">Top Clientes</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Cliente</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground">Investimento</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground">Receita</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data!.topClients.map((client) => (
                <tr key={client.clientId} className="hover:bg-accent/30 transition-colors">
                  <td className="px-6 py-3 font-medium">
                    <Link
                      href={`/clients/${client.clientId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {client.clientName}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatCurrency(parseFloat(client.spend))}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {formatCurrency(parseFloat(client.revenue))}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-medium">
                    <span
                      className={
                        client.roas >= 3
                          ? 'text-green-600'
                          : client.roas >= 1
                          ? 'text-amber-600'
                          : 'text-destructive'
                      }
                    >
                      {client.roas.toFixed(2)}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && (data?.topClients ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma métrica disponível para o período selecionado.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Conecte contas de anúncio e aguarde o sync.
          </p>
        </div>
      )}
    </div>
  )
}
