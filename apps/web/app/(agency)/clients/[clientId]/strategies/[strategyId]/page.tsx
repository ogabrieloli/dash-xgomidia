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
  ReferenceLine,
} from 'recharts'
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Check, RefreshCw, Target, X, Download, SlidersHorizontal, Columns3, Pencil, Edit2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import { AiChat } from '@/components/ai-chat'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker, type DateRangeValue } from '@/components/date-range-picker'
import { DashboardBuilder, METRIC_OPTIONS } from '@/components/dashboard-builder'
import { StrategyInsights } from '@/components/strategy-insights'
import { MetricFunnel } from '@/components/metric-funnel'
import { BudgetPacing } from '@/components/budget-pacing'
import { MetricPickerDrawer } from '@/components/metric-picker-drawer'

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

interface MetricConfig {
  // Goals
  goalRoas?: number
  goalCpl?: number
  goalCpa?: number
  goalCostPerPurchase?: number
  // View personalization
  kpiMetrics?: string[]
  funnelMetrics?: string[]
  campaignColumns?: string[]
  // Chart personalization
  areaMetrics?: string[]
  barMetric?: string
  // Daily table personalization
  dailyColumns?: string[]
}

interface Strategy {
  id: string; name: string; funnelType: string; projectId: string
  objective: string | null; budget: number | null
  metricConfig: MetricConfig & Record<string, unknown>
  dashboardConfig: unknown
}

// ─── Default metric sets by objective ─────────────────────────────────────────

const DEFAULT_KPI_METRICS: Record<string, string[]> = {
  LEAD:     ['spend', 'leads', 'cpl', 'ctr', 'conversionRate'],
  SALES:    ['spend', 'revenue', 'roas', 'purchases', 'costPerPurchase'],
  BRANDING: ['spend', 'reach', 'impressions', 'cpm', 'frequency'],
  _default: ['spend', 'revenue', 'roas', 'conversions', 'ctr'],
}

const DEFAULT_FUNNEL_METRICS: Record<string, string[]> = {
  LEAD:     ['impressions', 'clicks', 'landingPageViews', 'leads', 'conversions'],
  SALES:    ['impressions', 'clicks', 'addToCart', 'initiateCheckout', 'purchases'],
  BRANDING: ['reach', 'impressions', 'clicks', 'postEngagement', 'videoViews3s'],
  _default: ['impressions', 'clicks', 'conversions'],
}

const DEFAULT_CAMPAIGN_COLUMNS: Record<string, string[]> = {
  LEAD:     ['spend', 'leads', 'cpl', 'ctr'],
  SALES:    ['spend', 'purchases', 'costPerPurchase', 'roas'],
  BRANDING: ['spend', 'reach', 'impressions', 'cpm'],
  _default: ['spend', 'roas', 'ctr'],
}

const DEFAULT_AREA_METRICS: Record<string, string[]> = {
  LEAD:     ['spend', 'leads'],
  SALES:    ['spend', 'revenue'],
  BRANDING: ['spend', 'impressions'],
  _default: ['spend', 'revenue'],
}

const DEFAULT_BAR_METRIC: Record<string, string> = {
  LEAD:     'cpl',
  SALES:    'roas',
  BRANDING: 'cpm',
  _default: 'roas',
}

const DEFAULT_DAILY_COLUMNS = ['impressions', 'clicks', 'spend', 'revenue', 'ctr', 'roas', 'cpa', 'conversions']

interface CampaignRow {
  externalCampaignId: string
  campaignName: string | null
  totals: MetricsTotals
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


type TabId = 'metricas' | 'campanhas' | 'dashboard'

function exportCsv(filename: string, headers: string[], rows: (string | number)[][][]) {
  const escape = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.flat().map(escape).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Campaign Breakdown Table ──────────────────────────────────────────────────

function getCampaignColValue(c: CampaignRow, key: string): number {
  const t = c.totals
  switch (key) {
    case 'spend': return parseFloat(t.spend)
    case 'leads': return t.leads ?? 0
    case 'purchases': return t.purchases ?? 0
    case 'roas': return t.derived.roas
    case 'ctr': return t.derived.ctr
    case 'cpl': return t.derived.cpl
    case 'costPerPurchase': return t.derived.costPerPurchase
    case 'cpa': return t.derived.cpa
    case 'cpc': return t.derived.cpc
    case 'cpm': return t.derived.cpm
    case 'impressions': return t.impressions
    case 'clicks': return t.clicks
    case 'conversions': return t.conversions
    case 'reach': return t.reach ?? 0
    case 'revenue': return parseFloat(t.revenue ?? '0')
    case 'addToCart': return t.addToCart ?? 0
    case 'initiateCheckout': return t.initiateCheckout ?? 0
    case 'viewContent': return t.viewContent ?? 0
    case 'postEngagement': return t.postEngagement ?? 0
    case 'videoViews3s': return t.videoViews3s ?? 0
    case 'completeRegistration': return t.completeRegistration ?? 0
    case 'landingPageViews': return t.landingPageViews ?? 0
    case 'linkClicks': return t.linkClicks ?? 0
    case 'conversionRate': return t.derived.conversionRate
    case 'cartToCheckoutRate': return t.derived.cartToCheckoutRate
    case 'checkoutToPurchaseRate': return t.derived.checkoutToPurchaseRate
    default: return 0
  }
}

function formatCampaignColValue(c: CampaignRow, key: string): string {
  const t = c.totals
  const opt = METRIC_OPTIONS.find((m) => m.value === key)
  const raw = getCampaignColValue(c, key)
  if (raw === 0 && key !== 'conversions' && key !== 'clicks' && key !== 'impressions') return '—'
  switch (opt?.format) {
    case 'currency': return formatCurrency(raw)
    case 'percent': return formatPercent(raw)
    case 'roas': {
      const colored = raw >= 2 ? 'text-green-600 font-medium' : raw > 0 && raw < 1 ? 'text-destructive font-medium' : ''
      // Return as string — color applied below
      return `${raw.toFixed(2)}x|${colored}`
    }
    default: return formatNumber(raw)
  }
}

function getDailyColValue(r: MetricRow, key: string): number {
  switch (key) {
    case 'spend': return parseFloat(r.spend)
    case 'revenue': return r.revenue ? parseFloat(r.revenue) : 0
    case 'impressions': return r.impressions
    case 'clicks': return r.clicks
    case 'conversions': return r.conversions
    case 'reach': return r.reach ?? 0
    case 'videoViews': return r.videoViews ?? 0
    case 'leads': return r.leads ?? 0
    case 'completeRegistration': return r.completeRegistration ?? 0
    case 'landingPageViews': return r.landingPageViews ?? 0
    case 'linkClicks': return r.linkClicks ?? 0
    case 'purchases': return r.purchases ?? 0
    case 'addToCart': return r.addToCart ?? 0
    case 'initiateCheckout': return r.initiateCheckout ?? 0
    case 'viewContent': return r.viewContent ?? 0
    case 'postEngagement': return r.postEngagement ?? 0
    case 'videoViews3s': return r.videoViews3s ?? 0
    case 'roas': return r.derived.roas
    case 'ctr': return r.derived.ctr
    case 'cpa': return r.derived.cpa
    case 'cpc': return r.derived.cpc
    case 'cpl': return r.derived.cpl
    case 'cpm': return r.derived.cpm
    case 'conversionRate': return r.derived.conversionRate
    case 'costPerPurchase': return r.derived.costPerPurchase
    case 'cartToCheckoutRate': return r.derived.cartToCheckoutRate
    case 'checkoutToPurchaseRate': return r.derived.checkoutToPurchaseRate
    default: return 0
  }
}

function formatDailyColValue(r: MetricRow, key: string): string {
  const opt = METRIC_OPTIONS.find((m) => m.value === key)
  const raw = getDailyColValue(r, key)
  if (raw === 0 && key !== 'conversions' && key !== 'clicks' && key !== 'impressions') return '—'
  switch (opt?.format) {
    case 'currency': return formatCurrency(raw)
    case 'percent': return formatPercent(raw)
    case 'roas': return `${raw.toFixed(2)}x`
    default: return formatNumber(raw)
  }
}

function getChartValueFromRow(r: MetricRow, key: string): number {
  return getDailyColValue(r, key)
}

function CampaignBreakdownTable({
  campaigns,
  columns,
  onEditColumns,
}: {
  campaigns: CampaignRow[]
  columns: string[]
  onEditColumns?: () => void
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0] ?? 'spend')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...campaigns].sort((a, b) => {
    const diff = getCampaignColValue(a, sortKey) - getCampaignColValue(b, sortKey)
    return sortDir === 'desc' ? -diff : diff
  })

  function SortHeader({ label, k }: { label: string; k: string }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => toggleSort(k)}
        className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      >
        <span className="flex items-center justify-end gap-1">
          {label}
          {active ? (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
        </span>
      </th>
    )
  }

  function handleExport() {
    const colDefs = columns.map((c) => METRIC_OPTIONS.find((m) => m.value === c))
    const headers = ['Campanha', ...colDefs.map((d) => d?.label ?? '')]
    const rows = sorted.map((c) => [[
      c.campaignName ?? c.externalCampaignId,
      ...columns.map((col) => String(getCampaignColValue(c, col))),
    ]])
    exportCsv('campanhas.csv', headers, rows)
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Campanhas</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}</span>
          {onEditColumns && (
            <button
              onClick={onEditColumns}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Colunas
            </button>
          )}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Campanha</th>
              {columns.map((col) => {
                const opt = METRIC_OPTIONS.find((m) => m.value === col)
                return <SortHeader key={col} label={opt?.label ?? col} k={col} />
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((c) => (
              <tr key={c.externalCampaignId} className="hover:bg-accent/20 transition-colors">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground text-xs leading-tight line-clamp-2 max-w-[240px]">
                    {c.campaignName ?? c.externalCampaignId}
                  </p>
                </td>
                {columns.map((col) => {
                  const formatted = formatCampaignColValue(c, col)
                  const [val, colorClass] = formatted.includes('|') ? formatted.split('|') : [formatted, '']
                  return (
                    <td key={col} className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {colorClass ? <span className={colorClass}>{val}</span> : val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StrategyDashboardPage() {
  const { clientId, strategyId } = useParams<{ clientId: string; strategyId: string }>()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabId>('metricas')
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [campaignAccountId, setCampaignAccountId] = useState<string | null>(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalDraft, setGoalDraft] = useState<MetricConfig>({})
  // Personalization drawers
  const [showKpiPicker, setShowKpiPicker] = useState(false)
  const [showFunnelPicker, setShowFunnelPicker] = useState(false)
  const [showCampaignColumnsPicker, setShowCampaignColumnsPicker] = useState(false)
  const [showAreaChartPicker, setShowAreaChartPicker] = useState(false)
  const [showBarChartPicker, setShowBarChartPicker] = useState(false)
  const [showDailyColumnsPicker, setShowDailyColumnsPicker] = useState(false)
  // Campaign tab mode
  const [editingCampaigns, setEditingCampaigns] = useState(false)

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

  // Campaign breakdown (for Métricas tab)
  const { data: campaignBreakdown } = useQuery({
    queryKey: ['metrics-campaigns', strategyId, selectedAccountId, dateRange],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const res = await api.get<{ data: CampaignRow[] }>(
        '/api/metrics/campaigns',
        { params: { strategyId, clientId, adAccountId: selectedAccountId, dateFrom: dateRange.from, dateTo: dateRange.to } },
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

  // Timeline entries for chart annotations
  const { data: timelineEntries } = useQuery({
    queryKey: ['timeline', clientId, dateRange],
    queryFn: async () => {
      const res = await api.get<{ data: { id: string; title: string; occurredAt: string; type: string }[] }>(
        '/api/timeline',
        { params: { clientId } },
      )
      // Filter to entries within the current dateRange
      return res.data.data.filter((e) => {
        const d = e.occurredAt.slice(0, 10)
        return d >= dateRange.from && d <= dateRange.to
      })
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
    .map((r) => {
      const entry: Record<string, unknown> = { date: format(new Date(r.date + 'T00:00:00'), 'dd/MM') }
      for (const m of [...areaMetrics, barMetric]) {
        entry[m] = getChartValueFromRow(r, m)
      }
      return entry
    })

  // Annotations: group by date label, collect titles
  const annotationMap = new Map<string, string[]>()
  for (const entry of timelineEntries ?? []) {
    const label = format(new Date(entry.occurredAt.slice(0, 10) + 'T00:00:00'), 'dd/MM')
    const existing = annotationMap.get(label)
    if (existing) existing.push(entry.title)
    else annotationMap.set(label, [entry.title])
  }
  const annotations = Array.from(annotationMap.entries()).map(([date, titles]) => ({ date, label: titles.join(' · ') }))

  const strategyInfo = strategyData?.strategy
  const projectInfo = strategyData?.project

  const saveMetricConfigMutation = useMutation({
    mutationFn: async (patch: Partial<MetricConfig>) => {
      const current = (strategyInfo?.metricConfig ?? {}) as Record<string, unknown>
      await api.patch(`/api/strategies/${strategyId}/metric-config`, {
        metricConfig: { ...current, ...patch },
      })
    },
    onSuccess: (_data, patch) => {
      void queryClient.invalidateQueries({ queryKey: ['strategy', strategyId] })
      if ('goalRoas' in patch || 'goalCpl' in patch || 'goalCpa' in patch || 'goalCostPerPurchase' in patch) {
        setShowGoalForm(false)
      }
    },
  })

  const savedConfig = (strategyInfo?.metricConfig ?? {}) as MetricConfig
  const goals = savedConfig as Pick<MetricConfig, 'goalRoas' | 'goalCpl' | 'goalCpa' | 'goalCostPerPurchase'>
  const objective = strategyInfo?.objective ?? null
  const objectiveKey = objective ?? '_default'
  const kpiMetrics = savedConfig.kpiMetrics ?? DEFAULT_KPI_METRICS[objectiveKey] ?? DEFAULT_KPI_METRICS._default
  const funnelMetrics = savedConfig.funnelMetrics ?? DEFAULT_FUNNEL_METRICS[objectiveKey] ?? DEFAULT_FUNNEL_METRICS._default
  const campaignColumns = savedConfig.campaignColumns ?? DEFAULT_CAMPAIGN_COLUMNS[objectiveKey] ?? DEFAULT_CAMPAIGN_COLUMNS._default
  const areaMetrics = savedConfig.areaMetrics ?? DEFAULT_AREA_METRICS[objectiveKey] ?? DEFAULT_AREA_METRICS._default
  const barMetric = savedConfig.barMetric ?? DEFAULT_BAR_METRIC[objectiveKey] ?? DEFAULT_BAR_METRIC._default
  const dailyColumns = savedConfig.dailyColumns ?? DEFAULT_DAILY_COLUMNS

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setGoalDraft({
                  goalRoas: goals.goalRoas,
                  goalCpl: goals.goalCpl,
                  goalCpa: goals.goalCpa,
                  goalCostPerPurchase: goals.goalCostPerPurchase,
                })
                setShowGoalForm((v) => !v)
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Target className="h-3.5 w-3.5" />
              Metas
            </button>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
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

          {/* KPI Cards — dinâmicos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Métricas Gerais</p>
              <button
                onClick={() => setShowKpiPicker(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Personalizar
              </button>
            </div>
            <div className={`grid grid-cols-2 gap-4 ${kpiMetrics.length <= 3 ? 'lg:grid-cols-3' : kpiMetrics.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
              {kpiMetrics.map((metricKey) => {
                const opt = METRIC_OPTIONS.find((m) => m.value === metricKey)
                if (!opt || !totals) {
                  return <KpiCard key={metricKey} label={opt?.label ?? metricKey} value="—" loading={isLoading} />
                }
                // Derive value
                const d = totals.derived
                let value = '—'
                let rawVal = 0
                let sub: string | undefined
                let goal: number | undefined
                let currentRaw: number | undefined
                let goalLabel: string | undefined
                let goalLowerIsBetter = false
                let changeVal: number | undefined

                switch (metricKey) {
                  case 'spend':
                    rawVal = parseFloat(totals.spend)
                    value = formatCurrency(rawVal)
                    changeVal = delta(rawVal, prev ? parseFloat(prev.spend) : undefined, true)
                    break
                  case 'revenue':
                    rawVal = parseFloat(totals.revenue ?? '0')
                    value = formatCurrency(rawVal)
                    changeVal = delta(rawVal, prev ? parseFloat(prev.revenue) : undefined)
                    break
                  case 'roas':
                    rawVal = d.roas; value = `${d.roas.toFixed(2)}x`
                    changeVal = delta(d.roas, prev?.derived.roas)
                    goal = goals.goalRoas; currentRaw = d.roas
                    goalLabel = goals.goalRoas ? `Meta: ${goals.goalRoas}x` : undefined
                    break
                  case 'conversions':
                    rawVal = totals.conversions; value = formatNumber(totals.conversions)
                    sub = `CPA: ${formatCurrency(d.cpa)}`
                    changeVal = delta(totals.conversions, prev?.conversions)
                    goal = goals.goalCpa; currentRaw = d.cpa
                    goalLabel = goals.goalCpa ? `Meta CPA: ${formatCurrency(goals.goalCpa)}` : undefined
                    goalLowerIsBetter = true
                    break
                  case 'ctr':
                    rawVal = d.ctr; value = formatPercent(d.ctr)
                    sub = `CPC: ${formatCurrency(d.cpc)}`
                    changeVal = delta(d.ctr, prev?.derived.ctr)
                    break
                  case 'cpc': rawVal = d.cpc; value = formatCurrency(d.cpc); changeVal = delta(d.cpc, prev?.derived.cpc, true); break
                  case 'cpa': rawVal = d.cpa; value = formatCurrency(d.cpa); changeVal = delta(d.cpa, prev?.derived.cpa, true); break
                  case 'cpm': rawVal = d.cpm; value = formatCurrency(d.cpm); changeVal = delta(d.cpm, prev?.derived.cpm, true); break
                  case 'impressions': rawVal = totals.impressions; value = formatNumber(totals.impressions); changeVal = delta(totals.impressions, prev?.impressions); break
                  case 'clicks': rawVal = totals.clicks; value = formatNumber(totals.clicks); changeVal = delta(totals.clicks, prev?.clicks); break
                  case 'reach': rawVal = totals.reach ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.reach); break
                  case 'frequency': rawVal = totals.reach ? totals.impressions / totals.reach : 0; value = rawVal.toFixed(2); break
                  case 'leads': rawVal = totals.leads ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.leads)
                    goal = goals.goalCpl; currentRaw = d.cpl; goalLabel = goals.goalCpl ? `Meta CPL: ${formatCurrency(goals.goalCpl)}` : undefined; goalLowerIsBetter = true; break
                  case 'cpl': rawVal = d.cpl; value = formatCurrency(d.cpl); changeVal = delta(d.cpl, prev?.derived.cpl, true)
                    goal = goals.goalCpl; currentRaw = d.cpl; goalLabel = goals.goalCpl ? `Meta: ${formatCurrency(goals.goalCpl)}` : undefined; goalLowerIsBetter = true; break
                  case 'conversionRate': rawVal = d.conversionRate; value = formatPercent(d.conversionRate); changeVal = delta(d.conversionRate, prev?.derived.conversionRate); break
                  case 'purchases': rawVal = totals.purchases ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.purchases)
                    goal = goals.goalCostPerPurchase; currentRaw = d.costPerPurchase
                    goalLabel = goals.goalCostPerPurchase ? `Meta Custo: ${formatCurrency(goals.goalCostPerPurchase)}` : undefined; goalLowerIsBetter = true; break
                  case 'costPerPurchase': rawVal = d.costPerPurchase; value = formatCurrency(d.costPerPurchase); changeVal = delta(d.costPerPurchase, prev?.derived.costPerPurchase, true)
                    goal = goals.goalCostPerPurchase; currentRaw = d.costPerPurchase; goalLowerIsBetter = true; break
                  case 'addToCart': rawVal = totals.addToCart ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.addToCart); break
                  case 'initiateCheckout': rawVal = totals.initiateCheckout ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.initiateCheckout); break
                  case 'viewContent': rawVal = totals.viewContent ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.viewContent); break
                  case 'postEngagement': rawVal = totals.postEngagement ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.postEngagement); break
                  case 'videoViews3s': rawVal = totals.videoViews3s ?? 0; value = formatNumber(rawVal); changeVal = delta(rawVal, prev?.videoViews3s); break
                  case 'completeRegistration': rawVal = totals.completeRegistration ?? 0; value = formatNumber(rawVal); break
                  case 'landingPageViews': rawVal = totals.landingPageViews ?? 0; value = formatNumber(rawVal); break
                  case 'linkClicks': rawVal = totals.linkClicks ?? 0; value = formatNumber(rawVal); break
                  case 'cartToCheckoutRate': rawVal = d.cartToCheckoutRate; value = formatPercent(d.cartToCheckoutRate); break
                  case 'checkoutToPurchaseRate': rawVal = d.checkoutToPurchaseRate; value = formatPercent(d.checkoutToPurchaseRate); break
                  case 'videoViews': rawVal = totals.videoViews ?? 0; value = formatNumber(rawVal); break
                  default: value = '—'
                }

                return (
                  <KpiCard
                    key={metricKey}
                    label={opt.label}
                    value={value}
                    sub={sub}
                    change={changeVal}
                    goal={goal}
                    currentRaw={currentRaw}
                    goalLabel={goalLabel}
                    goalLowerIsBetter={goalLowerIsBetter}
                    loading={isLoading}
                  />
                )
              })}
            </div>
          </div>

          {/* Budget pacing */}
          {!isLoading && strategyInfo?.budget && totals && (
            <BudgetPacing
              budget={strategyInfo.budget}
              spend={spend}
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
            />
          )}

          {/* Painel de metas */}
          {showGoalForm && (
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Metas da Estratégia</h3>
                <button onClick={() => setShowGoalForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {(strategyInfo?.objective === 'SALES' || !strategyInfo?.objective) && (
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">ROAS alvo</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="ex: 3.0"
                      value={goalDraft.goalRoas ?? ''}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, goalRoas: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                )}
                {(strategyInfo?.objective === 'LEAD' || !strategyInfo?.objective) && (
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">CPL alvo (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ex: 30.00"
                      value={goalDraft.goalCpl ?? ''}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, goalCpl: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                )}
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">CPA alvo (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="ex: 50.00"
                    value={goalDraft.goalCpa ?? ''}
                    onChange={(e) => setGoalDraft((d) => ({ ...d, goalCpa: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                {(strategyInfo?.objective === 'SALES' || !strategyInfo?.objective) && (
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Custo por Compra alvo (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ex: 80.00"
                      value={goalDraft.goalCostPerPurchase ?? ''}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, goalCostPerPurchase: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => saveMetricConfigMutation.mutate(goalDraft)}
                  disabled={saveMetricConfigMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saveMetricConfigMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Salvar metas
                </button>
                <button
                  onClick={() => setShowGoalForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Funil de performance editável */}
          {!isLoading && totals && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funil de Performance</p>
                <button
                  onClick={() => setShowFunnelPicker(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar Funil
                </button>
              </div>
              <MetricFunnel totals={totals} objective={objective} customMetrics={funnelMetrics} />
            </div>
          )}

          {/* Breakdown por campanha */}
          {!isLoading && campaignBreakdown && campaignBreakdown.length > 0 && (
            <CampaignBreakdownTable
              campaigns={campaignBreakdown}
              columns={campaignColumns}
              onEditColumns={() => setShowCampaignColumnsPicker(true)}
            />
          )}

          {!isLoading && chartData.length > 0 && (() => {
            const AREA_COLORS = ['hsl(var(--primary))', '#22c55e', '#f59e0b']
            const barOpt = METRIC_OPTIONS.find((m) => m.value === barMetric)
            const barLabel = barOpt?.label ?? barMetric
            const areaLabels = areaMetrics.map((m) => METRIC_OPTIONS.find((o) => o.value === m)?.label ?? m)
            function fmtTick(metric: string, v: number): string {
              const opt = METRIC_OPTIONS.find((m) => m.value === metric)
              if (opt?.format === 'currency') return `R$${(v / 1000).toFixed(0)}k`
              if (opt?.format === 'percent') return `${(v * 100).toFixed(0)}%`
              if (opt?.format === 'roas') return `${v.toFixed(1)}x`
              return formatNumber(v)
            }
            function fmtTooltip(metric: string, v: number): string {
              const opt = METRIC_OPTIONS.find((m) => m.value === metric)
              if (opt?.format === 'currency') return formatCurrency(v)
              if (opt?.format === 'percent') return formatPercent(v)
              if (opt?.format === 'roas') return `${v.toFixed(2)}x`
              return formatNumber(v)
            }
            return (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Area Chart */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">{areaLabels.join(' vs ')}</h3>
                    <button
                      onClick={() => setShowAreaChartPicker(true)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                      Editar
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        {areaMetrics.map((m, i) => (
                          <linearGradient key={m} id={`areaGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={AREA_COLORS[i] ?? AREA_COLORS[0]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={AREA_COLORS[i] ?? AREA_COLORS[0]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtTick(areaMetrics[0] ?? 'spend', v)} />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          const idx = areaMetrics.indexOf(name)
                          return [fmtTooltip(name, v), areaLabels[idx] ?? name]
                        }}
                        contentStyle={{ fontSize: 11 }}
                      />
                      {areaMetrics.map((m, i) => (
                        <Area
                          key={m}
                          type="monotone"
                          dataKey={m}
                          stroke={AREA_COLORS[i] ?? AREA_COLORS[0]}
                          fill={`url(#areaGrad${i})`}
                          strokeWidth={2}
                        />
                      ))}
                      {annotations.map((a) => (
                        <ReferenceLine key={a.date} x={a.date} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '●', position: 'top', fontSize: 8, fill: '#f59e0b' }} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar Chart */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">{barLabel} Diário</h3>
                    <button
                      onClick={() => setShowBarChartPicker(true)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                      Editar
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtTick(barMetric, v)} />
                      <Tooltip formatter={(v: number) => [fmtTooltip(barMetric, v), barLabel]} contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey={barMetric} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      {annotations.map((a) => (
                        <ReferenceLine key={a.date} x={a.date} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '●', position: 'top', fontSize: 8, fill: '#f59e0b' }} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}

          {/* Legenda de eventos da timeline */}
          {annotations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {annotations.map((a) => (
                <span key={a.date} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  <span className="font-medium">{a.date}</span>
                  <span className="text-amber-600">·</span>
                  {a.label}
                </span>
              ))}
            </div>
          )}

          {!isLoading && (metrics?.rows ?? []).length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Métricas Diárias</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDailyColumnsPicker(true)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                    Colunas
                  </button>
                  <button
                    onClick={() => {
                      const colDefs = dailyColumns.map((c) => METRIC_OPTIONS.find((m) => m.value === c))
                      const headers = ['Data', ...colDefs.map((d) => d?.label ?? '')]
                      const rows = (metrics?.rows ?? []).map((r) => [[
                        r.date,
                        ...dailyColumns.map((col) => String(getDailyColValue(r, col))),
                      ]])
                      exportCsv(`metricas-${dateRange.from}-${dateRange.to}.csv`, headers, rows)
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Data</th>
                      {dailyColumns.map((col) => {
                        const opt = METRIC_OPTIONS.find((m) => m.value === col)
                        return (
                          <th key={col} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {opt?.label ?? col}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...(metrics?.rows ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((row) => (
                      <tr key={row.date} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-xs">
                          {format(new Date(row.date + 'T00:00:00'), 'dd/MM/yyyy')}
                        </td>
                        {dailyColumns.map((col) => (
                          <td key={col} className="px-4 py-2.5 tabular-nums whitespace-nowrap text-right text-xs">
                            {formatDailyColValue(row, col)}
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

          {/* Alertas proativos — mockado, servidor de e-mail ainda não ativo */}
          <div className="rounded-lg border bg-card p-5 opacity-70">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Alertas Proativos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Receba alertas quando uma meta for violada ou o ROAS cair abaixo do esperado.</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">Em breve</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">E-mail de alerta</span>
                <input
                  disabled
                  placeholder="gestor@agencia.com"
                  className="w-full rounded-md border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground cursor-not-allowed"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Webhook URL</span>
                <input
                  disabled
                  placeholder="https://hooks.slack.com/..."
                  className="w-full rounded-md border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground cursor-not-allowed"
                />
              </label>
            </div>
            <button
              disabled
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary/40 px-4 py-2 text-xs font-medium text-primary-foreground cursor-not-allowed"
            >
              Salvar configuração de alertas
            </button>
          </div>

          <AiChat strategyId={strategyId} clientId={clientId} />
        </>
      )}

      {/* === TAB: Campanhas === */}
      {activeTab === 'campanhas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {editingCampaigns
                ? 'Selecione as campanhas que fazem parte desta estratégia.'
                : linkedCampaigns && linkedCampaigns.length > 0
                  ? `${linkedCampaigns.length} campanha${linkedCampaigns.length !== 1 ? 's' : ''} vinculada${linkedCampaigns.length !== 1 ? 's' : ''} — métricas filtradas por essas campanhas.`
                  : 'Nenhuma campanha vinculada ainda.'}
            </p>
            <button
              onClick={() => setEditingCampaigns((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                editingCampaigns
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {editingCampaigns ? <Check className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
              {editingCampaigns ? 'Concluir' : 'Editar seleção'}
            </button>
          </div>

          {/* Modo visualização: apenas campanhas vinculadas */}
          {!editingCampaigns && (
            <>
              {!linkedCampaigns || linkedCampaigns.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card p-10 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Nenhuma campanha vinculada a esta estratégia.</p>
                  <button
                    onClick={() => setEditingCampaigns(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Vincular campanhas
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Campanha</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">ID externo</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {linkedCampaigns.map((c) => (
                        <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground text-sm">{c.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{c.externalId}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600">
                              <Check className="h-3 w-3 mr-1" /> Vinculada
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Modo edição: lista completa de campanhas disponíveis */}
          {editingCampaigns && (
            <>
          <div>
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
            </>
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
                <>
                  <StrategyInsights
                    totals={strategyMetrics.totals}
                    objective={strategyInfo?.objective}
                    budget={strategyInfo?.budget}
                    goals={goals}
                  />
                </>
              )}
              <DashboardBuilder
                strategyId={strategyId}
                initialConfig={strategyInfo?.dashboardConfig as import('@/components/dashboard-builder').DashboardConfig | null}
                metrics={strategyMetrics ?? null}
                objective={strategyInfo?.objective}
                campaignData={campaignBreakdown ?? null}
                metricGoals={goals}
              />
            </>
          )}
        </div>
      )}

      {/* ─── Drawers de personalização ───────────────────────────────────────── */}
      {showKpiPicker && (
        <MetricPickerDrawer
          title="Personalizar KPIs"
          selected={kpiMetrics}
          minItems={3}
          maxItems={6}
          onClose={() => setShowKpiPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ kpiMetrics: metrics })}
        />
      )}
      {showFunnelPicker && (
        <MetricPickerDrawer
          title="Editar Funil"
          selected={funnelMetrics}
          minItems={2}
          maxItems={6}
          onClose={() => setShowFunnelPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ funnelMetrics: metrics })}
        />
      )}
      {showCampaignColumnsPicker && (
        <MetricPickerDrawer
          title="Colunas da Tabela de Campanhas"
          selected={campaignColumns}
          minItems={1}
          maxItems={6}
          onClose={() => setShowCampaignColumnsPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ campaignColumns: metrics })}
        />
      )}
      {showAreaChartPicker && (
        <MetricPickerDrawer
          title="Métricas do Gráfico de Área"
          selected={areaMetrics}
          minItems={1}
          maxItems={2}
          onClose={() => setShowAreaChartPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ areaMetrics: metrics })}
        />
      )}
      {showBarChartPicker && (
        <MetricPickerDrawer
          title="Métrica do Gráfico de Barras"
          selected={[barMetric]}
          minItems={1}
          maxItems={1}
          onClose={() => setShowBarChartPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ barMetric: metrics[0] })}
        />
      )}
      {showDailyColumnsPicker && (
        <MetricPickerDrawer
          title="Colunas da Tabela Diária"
          selected={dailyColumns}
          minItems={2}
          maxItems={8}
          onClose={() => setShowDailyColumnsPicker(false)}
          onChange={(metrics) => saveMetricConfigMutation.mutate({ dailyColumns: metrics })}
        />
      )}
    </div>
  )
}
