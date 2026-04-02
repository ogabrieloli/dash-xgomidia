'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format, subDays } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Check, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { AiChat } from '@/components/ai-chat'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker, type DateRangeValue } from '@/components/date-range-picker'
import { DashboardBuilder } from '@/components/dashboard-builder'
import { StrategyInsights } from '@/components/strategy-insights'

interface DerivedMetrics {
  ctr: number; cpc: number; cpa: number; roas: number; cpm: number
  cpl: number; conversionRate: number; costPerPurchase: number
  cartToCheckoutRate: number; checkoutToPurchaseRate: number
}

interface MetricRow {
  date: string; impressions: number; clicks: number; spend: string
  conversions: number; revenue: string | null
  reach?: number; videoViews?: number
  leads?: number; completeRegistration?: number; landingPageViews?: number; linkClicks?: number
  purchases?: number; addToCart?: number; initiateCheckout?: number; viewContent?: number
  postEngagement?: number; videoViews3s?: number
  derived: DerivedMetrics
}

interface MetricsTotals {
  impressions: number; clicks: number; spend: string; conversions: number
  revenue: string; reach?: number; videoViews?: number
  leads?: number; completeRegistration?: number; landingPageViews?: number; linkClicks?: number
  purchases?: number; addToCart?: number; initiateCheckout?: number; viewContent?: number
  postEngagement?: number; videoViews3s?: number
  derived: DerivedMetrics
}

interface Strategy {
  id: string; name: string; funnelType: string; projectId: string
  objective: string | null; budget: number | null
  dashboardConfig: unknown
}

interface AdAccount {
  id: string; platform: string; externalId: string; name: string; syncStatus: string
}

interface MetaCampaign {
  id: string; name: string; status: string; objective?: string
}

interface LinkedCampaign {
  id: string; externalId: string; name: string; adAccountId: string
}

const columnHelper = createColumnHelper<MetricRow>()

const columns = [
  columnHelper.accessor('date', {
    header: 'Data',
    cell: (info) => format(new Date(info.getValue() + 'T00:00:00'), 'dd/MM/yyyy'),
  }),
  columnHelper.accessor('impressions', { header: 'Impressões', cell: (info) => formatNumber(info.getValue()) }),
  columnHelper.accessor('clicks', { header: 'Cliques', cell: (info) => formatNumber(info.getValue()) }),
  columnHelper.accessor('spend', { header: 'Investimento', cell: (info) => formatCurrency(parseFloat(info.getValue())) }),
  columnHelper.accessor('conversions', { header: 'Conversões', cell: (info) => formatNumber(info.getValue()) }),
  columnHelper.accessor('revenue', {
    header: 'Receita',
    cell: (info) => { const v = info.getValue(); return v ? formatCurrency(parseFloat(v)) : '—' },
  }),
  columnHelper.accessor((row) => row.derived.ctr, { id: 'ctr', header: 'CTR', cell: (info) => formatPercent(info.getValue()) }),
  columnHelper.accessor((row) => row.derived.roas, { id: 'roas', header: 'ROAS', cell: (info) => `${info.getValue().toFixed(2)}x` }),
  columnHelper.accessor((row) => row.derived.cpa, { id: 'cpa', header: 'CPA', cell: (info) => formatCurrency(info.getValue()) }),
]

type TabId = 'metricas' | 'campanhas' | 'dashboard'

export default function StrategyDashboardPage() {
  const { clientId, strategyId } = useParams<{ clientId: string; strategyId: string }>()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabId>('metricas')
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [campaignAccountId, setCampaignAccountId] = useState<string | null>(null)

  // Strategy info
  const { data: strategyData } = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: async () => {
      const res = await api.get<{ data: { projects: Array<{ id: string; name: string; strategies: Array<Strategy & { id: string }> }> } }>(
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

  // Ad accounts
  const { data: accounts } = useQuery({
    queryKey: ['ad-accounts', clientId],
    queryFn: async () => {
      const res = await api.get<{ data: AdAccount[] }>('/api/ad-accounts', { params: { clientId } })
      return res.data.data
    },
  })

  // Linked campaigns for this strategy
  const { data: linkedCampaigns } = useQuery({
    queryKey: ['strategy-campaigns', strategyId],
    queryFn: async () => {
      const res = await api.get<{ data: LinkedCampaign[] }>(
        `/api/strategies/${strategyId}/campaigns`,
        { params: { clientId } },
      )
      return res.data.data
    },
  })

  // Meta campaigns for selected account (campaigns tab)
  const selectedCampaignAccountId = campaignAccountId ?? accounts?.[0]?.id ?? null
  const { data: metaCampaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ['meta-campaigns', selectedCampaignAccountId],
    enabled: !!selectedCampaignAccountId && activeTab === 'campanhas',
    queryFn: async () => {
      const res = await api.get<{ data: MetaCampaign[] }>(
        `/api/ad-accounts/${selectedCampaignAccountId}/campaigns`,
        { params: { clientId } },
      )
      return res.data.data
    },
  })

  const linkCampaignMutation = useMutation({
    mutationFn: async (campaign: MetaCampaign) => {
      await api.post(
        `/api/ad-accounts/${selectedCampaignAccountId}/strategy-campaigns`,
        {
          strategyId,
          campaigns: [{ externalId: campaign.id, name: campaign.name }],
        },
        { params: { clientId } },
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategy-campaigns', strategyId] }),
  })

  const unlinkCampaignMutation = useMutation({
    mutationFn: async (externalId: string) => {
      await api.delete(
        `/api/ad-accounts/${selectedCampaignAccountId}/strategy-campaigns/${externalId}`,
        { params: { clientId, strategyId } },
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategy-campaigns', strategyId] }),
  })

  const selectedAccountId = activeAccountId ?? accounts?.[0]?.id ?? null

  // Metrics (by ad account — for Métricas tab)
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics', selectedAccountId, dateRange],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const res = await api.get<{ data: { rows: MetricRow[]; totals: MetricsTotals; previousTotals?: MetricsTotals } }>(
        '/api/metrics/strategy',
        {
          params: {
            strategyId,
            adAccountId: selectedAccountId,
            clientId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            compare: 'true',
          }
        },
      )
      return res.data.data
    },
  })

  // Strategy metrics (filtered by linked campaigns — for Dashboard tab)
  const { data: strategyMetrics, isLoading: loadingStrategyMetrics } = useQuery({
    queryKey: ['strategy-metrics', strategyId, dateRange],
    queryFn: async () => {
      const res = await api.get<{ data: { rows: MetricRow[]; totals: MetricsTotals } }>(
        '/api/metrics/strategy',
        { params: { strategyId, clientId, dateFrom: dateRange.from, dateTo: dateRange.to } },
      )
      return res.data.data
    },
  })

  // Manual sync
  const syncMutation = useMutation({
    mutationFn: async (adAccountId: string) => {
      await api.post(`/api/ad-accounts/${adAccountId}/sync`, {}, { params: { clientId } })
    },
    onSuccess: () => {
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['metrics'] })
        void queryClient.invalidateQueries({ queryKey: ['strategy-metrics'] })
      }, 3000)
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
  const prev = metrics?.previousTotals
  const spend = parseFloat(totals?.spend ?? '0')
  const revenue = parseFloat(totals?.revenue ?? '0')

  // delta(current, previous) → % change; invertDelta=true para métricas onde menor = melhor
  function delta(cur: number, prevVal: number | undefined, invertDelta = false): number | undefined {
    if (prevVal === undefined || prevVal === 0) return undefined
    const pct = ((cur - prevVal) / Math.abs(prevVal)) * 100
    return invertDelta ? -pct : pct
  }

  const chartData = [...(metrics?.rows ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: format(new Date(r.date + 'T00:00:00'), 'dd/MM'),
      spend: parseFloat(r.spend),
      revenue: r.revenue ? parseFloat(r.revenue) : 0,
      roas: r.derived.roas,
    }))

  const strategyInfo = strategyData?.strategy
  const projectInfo = strategyData?.project
  const linkedIds = new Set(linkedCampaigns?.map((c) => c.externalId) ?? [])

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'metricas', label: 'Métricas' },
    { id: 'campanhas', label: `Campanhas${linkedCampaigns && linkedCampaigns.length > 0 ? ` (${linkedCampaigns.length})` : ''}` },
    { id: 'dashboard', label: 'Dashboard' },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
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
          <h1 className="text-2xl font-bold text-foreground">{strategyInfo?.name ?? 'Carregando...'}</h1>
          {strategyInfo?.funnelType && (
            <p className="text-sm text-muted-foreground mt-0.5">{strategyInfo.funnelType}</p>
          )}
        </div>
        {activeTab === 'metricas' && (
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* === TAB: Métricas === */}
      {activeTab === 'metricas' && (
        <>
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

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard
              label="Investimento"
              value={formatCurrency(spend)}
              change={delta(spend, prev ? parseFloat(prev.spend) : undefined, true)}
              loading={isLoading}
            />
            <KpiCard
              label="Receita"
              value={formatCurrency(revenue)}
              change={delta(revenue, prev ? parseFloat(prev.revenue) : undefined)}
              loading={isLoading}
            />
            <KpiCard
              label="ROAS"
              value={totals ? `${totals.derived.roas.toFixed(2)}x` : '—'}
              change={delta(totals?.derived.roas ?? 0, prev?.derived.roas)}
              loading={isLoading}
            />
            <KpiCard
              label="Conversões"
              value={totals ? formatNumber(totals.conversions) : '—'}
              sub={totals ? `CPA: ${formatCurrency(totals.derived.cpa)}` : undefined}
              change={delta(totals?.conversions ?? 0, prev?.conversions)}
              loading={isLoading}
            />
            <KpiCard
              label="CTR"
              value={totals ? formatPercent(totals.derived.ctr) : '—'}
              sub={totals ? `CPC: ${formatCurrency(totals.derived.cpc)}` : undefined}
              change={delta(totals?.derived.ctr ?? 0, prev?.derived.ctr)}
              loading={isLoading}
            />
          </div>

          {!isLoading && chartData.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name === 'spend' ? 'Investimento' : 'Receita']}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="url(#spendGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#revenueGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">ROAS Diário</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(2)}x`, 'ROAS']} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="roas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

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
                              {header.column.getIsSorted() === 'asc' && <ChevronUp className="h-3 w-3" />}
                              {header.column.getIsSorted() === 'desc' && <ChevronDown className="h-3 w-3" />}
                              {!header.column.getIsSorted() && <ChevronsUpDown className="h-3 w-3 opacity-40" />}
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
              <p className="text-sm text-muted-foreground">Nenhuma conta de anúncio conectada para este cliente.</p>
              <Link href={`/clients/${clientId}`} className="mt-3 inline-block text-sm text-primary hover:underline">
                Conectar conta →
              </Link>
            </div>
          )}

          {!isLoading && selectedAccountId && (metrics?.rows ?? []).length === 0 && (
            <div className="rounded-lg border border-dashed bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">Nenhuma métrica para o período selecionado.</p>
              <button
                onClick={() => syncMutation.mutate(selectedAccountId)}
                disabled={syncMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar conta agora'}
              </button>
            </div>
          )}

          <AiChat strategyId={strategyId} clientId={clientId} />
        </>
      )}

      {/* === TAB: Campanhas === */}
      {activeTab === 'campanhas' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Vincule campanhas do Meta Ads a esta estratégia. As métricas filtradas serão usadas no dashboard da estratégia.
            </p>

            {/* Account selector */}
            {accounts && accounts.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Conta:</span>
                {accounts.filter((a) => a.platform === 'META_ADS').map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setCampaignAccountId(acc.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${selectedCampaignAccountId === acc.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent'
                      }`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Campaigns list */}
          {loadingCampaigns ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando campanhas...</span>
            </div>
          ) : !metaCampaigns || metaCampaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada nesta conta.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Campanha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Objetivo</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Vinculada</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {metaCampaigns.map((campaign) => {
                    const isLinked = linkedIds.has(campaign.id)
                    return (
                      <tr key={campaign.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">{campaign.id}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${campaign.status === 'ACTIVE'
                            ? 'bg-green-500/15 text-green-600'
                            : 'bg-muted text-muted-foreground'
                            }`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                          {campaign.objective ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              if (isLinked) {
                                unlinkCampaignMutation.mutate(campaign.id)
                              } else {
                                linkCampaignMutation.mutate(campaign)
                              }
                            }}
                            disabled={linkCampaignMutation.isPending || unlinkCampaignMutation.isPending}
                            className={`inline-flex items-center justify-center h-6 w-6 rounded border transition-colors ${isLinked
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-input bg-background hover:bg-accent'
                              }`}
                          >
                            {isLinked && <Check className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {linkedCampaigns && linkedCampaigns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {linkedCampaigns.length} campanha{linkedCampaigns.length !== 1 ? 's' : ''} vinculada{linkedCampaigns.length !== 1 ? 's' : ''} — as métricas desta estratégia serão filtradas por essas campanhas.
            </p>
          )}

          {/* Sync manual */}
          {accounts && accounts.filter((a) => a.platform === 'META_ADS').length > 0 && (
            <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Sincronizar métricas agora</p>
                <p className="text-xs text-muted-foreground mt-0.5">Busca os dados mais recentes do Meta Ads para todas as contas conectadas.</p>
              </div>
              <button
                onClick={() => {
                  const metaAccounts = accounts?.filter((a) => a.platform === 'META_ADS') ?? []
                  for (const acc of metaAccounts) {
                    syncMutation.mutate(acc.id)
                  }
                }}
                disabled={syncMutation.isPending}
                className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Sincronizando...' : syncMutation.isSuccess ? 'Sincronizado!' : 'Sincronizar'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* === TAB: Dashboard Builder === */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Dashboard personalizado com dados reais do período selecionado.
            </p>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          {loadingStrategyMetrics ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando métricas...</span>
            </div>
          ) : (
            <>
              {strategyMetrics && (
                <StrategyInsights
                  totals={strategyMetrics.totals}
                  objective={strategyInfo?.objective}
                  budget={strategyInfo?.budget}
                />
              )}
              <DashboardBuilder
                strategyId={strategyId}
                initialConfig={strategyInfo?.dashboardConfig as import('@/components/dashboard-builder').DashboardConfig | null}
                metrics={strategyMetrics ?? null}
                objective={strategyInfo?.objective}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
