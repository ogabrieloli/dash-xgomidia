'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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
} from 'recharts'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { AiChat } from '@/components/ai-chat'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker, type DateRangeValue } from '@/components/date-range-picker'

interface DerivedMetrics {
  ctr: number
  cpc: number
  cpa: number
  roas: number
  cpm: number
}

interface MetricRow {
  date: string
  impressions: number
  clicks: number
  spend: string
  conversions: number
  revenue: string | null
  derived: DerivedMetrics
}

interface MetricsTotals {
  impressions: number
  clicks: number
  spend: string
  conversions: number
  revenue: string
  derived: DerivedMetrics
}

interface Strategy {
  id: string
  name: string
  funnelType: string
  projectId: string
}

interface Project {
  id: string
  name: string
  clientId: string
}

interface AdAccount {
  id: string
  platform: string
  externalId: string
  name: string
  syncStatus: string
}

const columnHelper = createColumnHelper<MetricRow>()

const columns = [
  columnHelper.accessor('date', {
    header: 'Data',
    cell: (info) => {
      const d = new Date(info.getValue() + 'T00:00:00')
      return format(d, 'dd/MM/yyyy')
    },
  }),
  columnHelper.accessor('impressions', {
    header: 'Impressões',
    cell: (info) => formatNumber(info.getValue()),
  }),
  columnHelper.accessor('clicks', {
    header: 'Cliques',
    cell: (info) => formatNumber(info.getValue()),
  }),
  columnHelper.accessor('spend', {
    header: 'Investimento',
    cell: (info) => formatCurrency(parseFloat(info.getValue())),
  }),
  columnHelper.accessor('conversions', {
    header: 'Conversões',
    cell: (info) => formatNumber(info.getValue()),
  }),
  columnHelper.accessor('revenue', {
    header: 'Receita',
    cell: (info) => {
      const v = info.getValue()
      return v ? formatCurrency(parseFloat(v)) : '—'
    },
  }),
  columnHelper.accessor((row) => row.derived.ctr, {
    id: 'ctr',
    header: 'CTR',
    cell: (info) => formatPercent(info.getValue()),
  }),
  columnHelper.accessor((row) => row.derived.roas, {
    id: 'roas',
    header: 'ROAS',
    cell: (info) => `${info.getValue().toFixed(2)}x`,
  }),
  columnHelper.accessor((row) => row.derived.cpa, {
    id: 'cpa',
    header: 'CPA',
    cell: (info) => formatCurrency(info.getValue()),
  }),
]

export default function StrategyDashboardPage() {
  const { clientId, strategyId } = useParams<{ clientId: string; strategyId: string }>()

  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

  // Load strategy info
  const { data: strategy } = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: async () => {
      // Get client to find project
      const res = await api.get<{ data: { projects: Array<{ id: string; name: string; strategies: Strategy[] }> } }>(
        `/api/clients/${clientId}`,
      )
      const client = res.data.data
      for (const project of client.projects) {
        const s = project.strategies.find((s) => s.id === strategyId)
        if (s) return { strategy: s, project }
      }
      return null
    },
  })

  // Load ad accounts for this client
  const { data: accounts } = useQuery({
    queryKey: ['ad-accounts', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: AdAccount[] }>('/api/ad-accounts', {
        params: { clientId },
      })
      return res.data.data
    },
  })

  const selectedAccountId = activeAccountId ?? accounts?.[0]?.id ?? null

  // Load metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics', selectedAccountId, dateRange],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const res = await api.get<{ data: { rows: MetricRow[]; totals: MetricsTotals } }>(
        '/api/metrics',
        {
          params: {
            adAccountId: selectedAccountId,
            clientId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
          },
        },
      )
      return res.data.data
    },
  })

  const table = useReactTable({
    data: metrics?.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const totals = metrics?.totals
  const spend = parseFloat(totals?.spend ?? '0')
  const revenue = parseFloat(totals?.revenue ?? '0')

  // Chart data — sorted by date ascending
  const chartData = [...(metrics?.rows ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: format(new Date(r.date + 'T00:00:00'), 'dd/MM'),
      spend: parseFloat(r.spend),
      revenue: r.revenue ? parseFloat(r.revenue) : 0,
      roas: r.derived.roas,
    }))

  const strategyInfo = strategy?.strategy
  const projectInfo = strategy?.project

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Link href="/clients" className="hover:underline">Clientes</Link>
            <span>/</span>
            <Link href={`/clients/${clientId}`} className="hover:underline">
              {projectInfo?.name ?? '...'}
            </Link>
            <span>/</span>
            <span>{strategyInfo?.name ?? '...'}</span>
          </nav>
          <h1 className="text-2xl font-bold text-foreground">
            {strategyInfo?.name ?? 'Carregando...'}
          </h1>
          {strategyInfo?.funnelType && (
            <p className="text-sm text-muted-foreground mt-0.5">{strategyInfo.funnelType}</p>
          )}
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Account selector */}
      {accounts && accounts.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Conta:</span>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setActiveAccountId(acc.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${selectedAccountId === acc.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-accent'
                }`}
            >
              {acc.name}
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Investimento" value={formatCurrency(spend)} loading={isLoading} />
        <KpiCard label="Receita" value={formatCurrency(revenue)} loading={isLoading} />
        <KpiCard
          label="ROAS"
          value={totals ? `${totals.derived.roas.toFixed(2)}x` : '—'}
          loading={isLoading}
        />
        <KpiCard
          label="Conversões"
          value={totals ? formatNumber(totals.conversions) : '—'}
          sub={totals ? `CPA: ${formatCurrency(totals.derived.cpa)}` : undefined}
          loading={isLoading}
        />
        <KpiCard
          label="CTR"
          value={totals ? formatPercent(totals.derived.ctr) : '—'}
          sub={totals ? `CPC: ${formatCurrency(totals.derived.cpc)}` : undefined}
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      {!isLoading && chartData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Spend vs Revenue */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Investimento vs Receita</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    formatCurrency(v),
                    name === 'spend' ? 'Investimento' : 'Receita',
                  ]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="hsl(var(--primary))"
                  fill="url(#spendGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#22c55e"
                  fill="url(#revenueGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ROAS por dia */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">ROAS Diário</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)}x`, 'ROAS']}
                  contentStyle={{ fontSize: 11 }}
                />
                <Bar
                  dataKey="roas"
                  fill="hsl(var(--primary))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Metrics Table */}
      {!isLoading && (metrics?.rows ?? []).length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-sm font-semibold text-foreground">Métricas Diárias</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' && (
                            <ChevronUp className="h-3 w-3" />
                          )}
                          {header.column.getIsSorted() === 'desc' && (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          {!header.column.getIsSorted() && (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && !selectedAccountId && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma conta de anúncio conectada para este cliente.
          </p>
          <Link
            href={`/clients/${clientId}`}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Conectar conta →
          </Link>
        </div>
      )}

      {!isLoading && selectedAccountId && (metrics?.rows ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma métrica para o período selecionado.
          </p>
        </div>
      )}

      {/* Chat de IA — disponível independente de haver métricas */}
      <AiChat strategyId={strategyId} clientId={clientId} />
    </div>
  )
}
