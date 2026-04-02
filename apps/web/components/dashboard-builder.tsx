'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useMutation } from '@tanstack/react-query'
import { Plus, Save, Trash2, GripVertical, Pencil, LayoutDashboard } from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils'
import type { LayoutItem, Layout } from 'react-grid-layout'

const GridLayout = dynamic(
  () => import('react-grid-layout').then((mod) => mod.GridLayout),
  { ssr: false },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardWidget {
  id: string
  type: 'kpi' | 'area_chart' | 'bar_chart'
  metric: string
  label: string
}

export interface DashboardConfig {
  layout: LayoutItem[]
  widgets: DashboardWidget[]
}

interface DerivedMetrics {
  ctr: number; cpc: number; cpa: number; roas: number; cpm: number
  cpl: number; conversionRate: number; costPerPurchase: number
  cartToCheckoutRate: number; checkoutToPurchaseRate: number
}

interface MetricRow {
  date: string
  impressions: number
  clicks: number
  spend: string
  conversions: number
  revenue: string | null
  reach?: number
  videoViews?: number
  leads?: number
  completeRegistration?: number
  landingPageViews?: number
  linkClicks?: number
  purchases?: number
  addToCart?: number
  initiateCheckout?: number
  viewContent?: number
  postEngagement?: number
  videoViews3s?: number
  derived: DerivedMetrics
}

interface MetricTotals {
  impressions: number
  clicks: number
  spend: string
  conversions: number
  revenue: string
  reach?: number
  videoViews?: number
  leads?: number
  completeRegistration?: number
  landingPageViews?: number
  linkClicks?: number
  purchases?: number
  addToCart?: number
  initiateCheckout?: number
  viewContent?: number
  postEngagement?: number
  videoViews3s?: number
  derived: DerivedMetrics
}

interface DashboardBuilderProps {
  strategyId: string
  initialConfig?: DashboardConfig | null
  metrics?: { rows: MetricRow[]; totals: MetricTotals } | null
  objective?: string | null
}

// ─── Metric config ─────────────────────────────────────────────────────────────

export const METRIC_OPTIONS = [
  // Universais
  { value: 'spend',                label: 'Investimento',          format: 'currency', group: 'universal' },
  { value: 'revenue',              label: 'Receita',               format: 'currency', group: 'universal' },
  { value: 'roas',                 label: 'ROAS',                  format: 'roas',     group: 'universal' },
  { value: 'ctr',                  label: 'CTR',                   format: 'percent',  group: 'universal' },
  { value: 'cpc',                  label: 'CPC',                   format: 'currency', group: 'universal' },
  { value: 'cpa',                  label: 'CPA',                   format: 'currency', group: 'universal' },
  { value: 'cpm',                  label: 'CPM',                   format: 'currency', group: 'universal' },
  { value: 'impressions',          label: 'Impressões',            format: 'number',   group: 'universal' },
  { value: 'clicks',               label: 'Cliques',               format: 'number',   group: 'universal' },
  { value: 'conversions',          label: 'Conversões',            format: 'number',   group: 'universal' },
  { value: 'reach',                label: 'Alcance',               format: 'number',   group: 'universal' },
  { value: 'frequency',            label: 'Frequência',            format: 'number',   group: 'universal' },
  // LEAD
  { value: 'leads',                label: 'Leads',                 format: 'number',   group: 'lead' },
  { value: 'cpl',                  label: 'CPL',                   format: 'currency', group: 'lead' },
  { value: 'conversionRate',       label: 'Taxa de Conversão',     format: 'percent',  group: 'lead' },
  { value: 'completeRegistration', label: 'Cadastros Completos',   format: 'number',   group: 'lead' },
  { value: 'landingPageViews',     label: 'Views de Landing Page', format: 'number',   group: 'lead' },
  { value: 'linkClicks',           label: 'Cliques no Link',       format: 'number',   group: 'lead' },
  // SALES
  { value: 'purchases',            label: 'Compras',               format: 'number',   group: 'sales' },
  { value: 'costPerPurchase',      label: 'Custo por Compra',      format: 'currency', group: 'sales' },
  { value: 'addToCart',            label: 'Adições ao Carrinho',   format: 'number',   group: 'sales' },
  { value: 'initiateCheckout',     label: 'Início de Checkout',    format: 'number',   group: 'sales' },
  { value: 'viewContent',          label: 'Visualiz. de Produto',  format: 'number',   group: 'sales' },
  { value: 'cartToCheckoutRate',   label: 'Taxa Carrinho→Checkout',format: 'percent',  group: 'sales' },
  { value: 'checkoutToPurchaseRate', label: 'Taxa Checkout→Compra',format: 'percent',  group: 'sales' },
  // BRANDING
  { value: 'postEngagement',       label: 'Engajamento',           format: 'number',   group: 'branding' },
  { value: 'videoViews3s',         label: 'Views 3s',              format: 'number',   group: 'branding' },
  { value: 'videoViews',           label: 'ThruPlay (15s)',         format: 'number',   group: 'branding' },
]

const OBJECTIVE_PRESETS: Record<string, { id: string; label: string; color: string; widgets: { type: 'kpi' | 'area_chart'; metric: string }[] }[]> = {
  LEAD: [
    {
      id: 'lead_overview',
      label: 'Leads',
      color: 'bg-blue-500/10 text-blue-700 border-blue-200',
      widgets: [
        { type: 'kpi', metric: 'leads' },
        { type: 'kpi', metric: 'cpl' },
        { type: 'kpi', metric: 'ctr' },
        { type: 'kpi', metric: 'conversionRate' },
        { type: 'area_chart', metric: 'spend' },
        { type: 'area_chart', metric: 'leads' },
      ],
    },
  ],
  SALES: [
    {
      id: 'sales_overview',
      label: 'Vendas',
      color: 'bg-green-500/10 text-green-700 border-green-200',
      widgets: [
        { type: 'kpi', metric: 'purchases' },
        { type: 'kpi', metric: 'roas' },
        { type: 'kpi', metric: 'costPerPurchase' },
        { type: 'kpi', metric: 'revenue' },
        { type: 'kpi', metric: 'addToCart' },
        { type: 'kpi', metric: 'initiateCheckout' },
        { type: 'area_chart', metric: 'spend' },
      ],
    },
  ],
  BRANDING: [
    {
      id: 'branding_overview',
      label: 'Branding',
      color: 'bg-purple-500/10 text-purple-700 border-purple-200',
      widgets: [
        { type: 'kpi', metric: 'reach' },
        { type: 'kpi', metric: 'frequency' },
        { type: 'kpi', metric: 'cpm' },
        { type: 'kpi', metric: 'postEngagement' },
        { type: 'kpi', metric: 'videoViews3s' },
        { type: 'area_chart', metric: 'impressions' },
      ],
    },
  ],
  // Presets genéricos (fallback quando sem objetivo)
  _generic: [
    {
      id: 'visibilidade',
      label: 'Visibilidade',
      color: 'bg-purple-500/10 text-purple-700 border-purple-200',
      widgets: [
        { type: 'kpi', metric: 'impressions' },
        { type: 'kpi', metric: 'reach' },
        { type: 'kpi', metric: 'frequency' },
        { type: 'kpi', metric: 'cpm' },
      ],
    },
    {
      id: 'performance',
      label: 'Performance',
      color: 'bg-blue-500/10 text-blue-700 border-blue-200',
      widgets: [
        { type: 'kpi', metric: 'clicks' },
        { type: 'kpi', metric: 'ctr' },
        { type: 'kpi', metric: 'cpc' },
        { type: 'area_chart', metric: 'spend' },
      ],
    },
    {
      id: 'conversao',
      label: 'Conversão',
      color: 'bg-green-500/10 text-green-700 border-green-200',
      widgets: [
        { type: 'kpi', metric: 'conversions' },
        { type: 'kpi', metric: 'cpa' },
        { type: 'kpi', metric: 'revenue' },
        { type: 'kpi', metric: 'roas' },
      ],
    },
  ],
}

const DEFAULT_WIDGET_SIZE: Record<DashboardWidget['type'], { w: number; h: number }> = {
  kpi:        { w: 3, h: 2 },
  area_chart: { w: 6, h: 4 },
  bar_chart:  { w: 6, h: 4 },
}

// ─── Value helpers ─────────────────────────────────────────────────────────────

function getMetricValue(metric: string, totals: MetricTotals): string {
  const d = totals.derived
  switch (metric) {
    case 'spend':                  return formatCurrency(parseFloat(totals.spend))
    case 'revenue':                return formatCurrency(parseFloat(totals.revenue ?? '0'))
    case 'roas':                   return `${d.roas.toFixed(2)}x`
    case 'ctr':                    return formatPercent(d.ctr)
    case 'cpc':                    return formatCurrency(d.cpc)
    case 'cpa':                    return formatCurrency(d.cpa)
    case 'cpm':                    return formatCurrency(d.cpm)
    case 'impressions':            return formatNumber(totals.impressions)
    case 'clicks':                 return formatNumber(totals.clicks)
    case 'conversions':            return formatNumber(totals.conversions)
    case 'reach':                  return formatNumber(totals.reach ?? 0)
    case 'frequency':              return totals.reach ? (totals.impressions / totals.reach).toFixed(2) : '—'
    case 'videoViews':             return formatNumber(totals.videoViews ?? 0)
    // LEAD
    case 'leads':                  return formatNumber(totals.leads ?? 0)
    case 'cpl':                    return formatCurrency(d.cpl)
    case 'conversionRate':         return formatPercent(d.conversionRate)
    case 'completeRegistration':   return formatNumber(totals.completeRegistration ?? 0)
    case 'landingPageViews':       return formatNumber(totals.landingPageViews ?? 0)
    case 'linkClicks':             return formatNumber(totals.linkClicks ?? 0)
    // SALES
    case 'purchases':              return formatNumber(totals.purchases ?? 0)
    case 'costPerPurchase':        return formatCurrency(d.costPerPurchase)
    case 'addToCart':              return formatNumber(totals.addToCart ?? 0)
    case 'initiateCheckout':       return formatNumber(totals.initiateCheckout ?? 0)
    case 'viewContent':            return formatNumber(totals.viewContent ?? 0)
    case 'cartToCheckoutRate':     return formatPercent(d.cartToCheckoutRate)
    case 'checkoutToPurchaseRate': return formatPercent(d.checkoutToPurchaseRate)
    // BRANDING
    case 'postEngagement':         return formatNumber(totals.postEngagement ?? 0)
    case 'videoViews3s':           return formatNumber(totals.videoViews3s ?? 0)
    default:                       return '—'
  }
}

function getChartValue(row: MetricRow, metric: string): number {
  const d = row.derived
  switch (metric) {
    case 'spend':                  return parseFloat(row.spend)
    case 'revenue':                return parseFloat(row.revenue ?? '0')
    case 'roas':                   return d.roas
    case 'ctr':                    return d.ctr
    case 'cpc':                    return d.cpc
    case 'cpa':                    return d.cpa
    case 'cpm':                    return d.cpm
    case 'impressions':            return row.impressions
    case 'clicks':                 return row.clicks
    case 'conversions':            return row.conversions
    case 'reach':                  return row.reach ?? 0
    case 'videoViews':             return row.videoViews ?? 0
    // LEAD
    case 'leads':                  return row.leads ?? 0
    case 'cpl':                    return d.cpl
    case 'conversionRate':         return d.conversionRate
    case 'completeRegistration':   return row.completeRegistration ?? 0
    case 'landingPageViews':       return row.landingPageViews ?? 0
    case 'linkClicks':             return row.linkClicks ?? 0
    // SALES
    case 'purchases':              return row.purchases ?? 0
    case 'costPerPurchase':        return d.costPerPurchase
    case 'addToCart':              return row.addToCart ?? 0
    case 'initiateCheckout':       return row.initiateCheckout ?? 0
    case 'viewContent':            return row.viewContent ?? 0
    case 'cartToCheckoutRate':     return d.cartToCheckoutRate
    case 'checkoutToPurchaseRate': return d.checkoutToPurchaseRate
    // BRANDING
    case 'postEngagement':         return row.postEngagement ?? 0
    case 'videoViews3s':           return row.videoViews3s ?? 0
    default:                       return 0
  }
}

function formatChartTick(metric: string, v: number): string {
  const opt = METRIC_OPTIONS.find((m) => m.value === metric)
  switch (opt?.format) {
    case 'currency': return `R$${(v / 1000).toFixed(0)}k`
    case 'percent':  return `${(v * 100).toFixed(0)}%`
    case 'roas':     return `${v.toFixed(1)}x`
    default:         return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
  }
}

function formatTooltipValue(metric: string, v: number): string {
  const opt = METRIC_OPTIONS.find((m) => m.value === metric)
  switch (opt?.format) {
    case 'currency': return formatCurrency(v)
    case 'percent':  return formatPercent(v)
    case 'roas':     return `${v.toFixed(2)}x`
    default:         return formatNumber(v)
  }
}

// ─── Widget renderers ──────────────────────────────────────────────────────────

function KpiWidget({ widget, metrics }: { widget: DashboardWidget; metrics?: { totals: MetricTotals } | null }) {
  const value = metrics ? getMetricValue(widget.metric, metrics.totals) : null
  return (
    <div className="flex flex-col justify-center h-full px-4 py-2">
      <p className="text-xs text-muted-foreground mb-1">{widget.label}</p>
      {value !== null ? (
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      ) : (
        <p className="text-2xl font-bold text-muted-foreground/40">—</p>
      )}
    </div>
  )
}

function ChartWidget({
  widget,
  metrics,
  type,
}: {
  widget: DashboardWidget
  metrics?: { rows: MetricRow[] } | null
  type: 'area' | 'bar'
}) {
  const chartData = (metrics?.rows ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date.slice(5), // MM-DD
      value: getChartValue(r, widget.metric),
    }))

  if (!metrics || chartData.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground/40 italic">Sem dados para o período</p>
      </div>
    )
  }

  return (
    <div className="flex-1 px-1 pb-2 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => formatChartTick(widget.metric, v)} width={40} />
            <Tooltip
              formatter={(v: number) => [formatTooltipValue(widget.metric, v), widget.label]}
              contentStyle={{ fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill={`url(#grad-${widget.id})`}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => formatChartTick(widget.metric, v)} width={40} />
            <Tooltip
              formatter={(v: number) => [formatTooltipValue(widget.metric, v), widget.label]}
              contentStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DashboardBuilder({ strategyId, initialConfig, metrics, objective }: DashboardBuilderProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialConfig?.widgets ?? [])
  const [layout, setLayout] = useState<LayoutItem[]>(initialConfig?.layout ?? [])
  const [isEditing, setIsEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState('spend')
  const [selectedType, setSelectedType] = useState<DashboardWidget['type']>('kpi')

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/strategies/${strategyId}/dashboard-config`, {
        dashboardConfig: { layout, widgets },
      })
    },
    onSuccess: () => {
      setSaved(true)
      setIsEditing(false)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const addWidget = useCallback((type: DashboardWidget['type'], metric: string) => {
    const id = `widget-${Date.now()}`
    const size = DEFAULT_WIDGET_SIZE[type]
    const label = METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? metric
    setWidgets((prev) => [...prev, { id, type, metric, label }])
    setLayout((prev) => [...prev, { i: id, x: 0, y: Infinity, ...size }])
  }, [])

  const activePresets = objective && OBJECTIVE_PRESETS[objective] ? OBJECTIVE_PRESETS[objective] : OBJECTIVE_PRESETS['_generic']

  const addPreset = useCallback((preset: (typeof OBJECTIVE_PRESETS)[string][number]) => {
    const now = Date.now()
    const newWidgets: DashboardWidget[] = preset.widgets.map((w, i) => ({
      id: `widget-${now}-${i}`,
      type: w.type,
      metric: w.metric,
      label: METRIC_OPTIONS.find((m) => m.value === w.metric)?.label ?? w.metric,
    }))
    const newLayout: LayoutItem[] = newWidgets.map((w, i) => ({
      i: w.id,
      x: (i % 4) * 3,
      y: Infinity,
      ...DEFAULT_WIDGET_SIZE[w.type],
    }))
    setWidgets((prev) => [...prev, ...newWidgets])
    setLayout((prev) => [...prev, ...newLayout])
  }, [])

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id))
    setLayout((prev) => prev.filter((l) => l.i !== id))
  }, [])

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout])
  }, [])

  const hasNoMetrics = !metrics || !metrics.totals

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Editar layout
            </button>
            {widgets.length > 0 && hasNoMetrics && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                Sem dados para o período selecionado
              </p>
            )}
          </>
        ) : (
          <>
            {/* Preset buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {activePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => addPreset(preset)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 ${preset.color}`}
                >
                  + {preset.label}
                </button>
              ))}
            </div>

            {/* Custom widget add */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-muted-foreground">Custom:</span>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as DashboardWidget['type'])}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="kpi">KPI</option>
                <option value="area_chart">Área</option>
                <option value="bar_chart">Barras</option>
              </select>
              <button
                onClick={() => addWidget(selectedType, selectedMetric)}
                className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </button>
            </div>

            {/* Save / Cancel */}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  saved
                    ? 'bg-green-500/15 text-green-600'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                } disabled:opacity-50`}
              >
                <Save className="h-3 w-3" />
                {saved ? 'Salvo!' : saveMutation.isPending ? 'Salvando...' : 'Salvar layout'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-16 text-center">
          <LayoutDashboard className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Dashboard vazio</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
            Clique em "Editar layout" e adicione widgets para construir seu dashboard.
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            Editar layout →
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-2 overflow-x-auto">
          <GridLayout
            layout={layout}
            width={960}
            gridConfig={{ cols: 12, rowHeight: 40 }}
            dragConfig={isEditing ? { handle: '.drag-handle', enabled: true } : { enabled: false }}
            resizeConfig={{ enabled: isEditing }}
            onLayoutChange={isEditing ? handleLayoutChange : undefined}
          >
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className="rounded-lg border bg-background flex flex-col overflow-hidden"
              >
                {/* Widget header */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30 flex-shrink-0">
                  {isEditing && (
                    <span className="drag-handle cursor-grab active:cursor-grabbing">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="text-xs font-medium text-foreground truncate flex-1">{widget.label}</span>
                  <span className="text-xs text-muted-foreground/60 bg-muted/50 rounded px-1 py-0.5 hidden sm:block">
                    {widget.type === 'kpi' ? 'KPI' : widget.type === 'area_chart' ? 'Área' : 'Barras'}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => removeWidget(widget.id)}
                      className="rounded p-0.5 hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>

                {/* Widget content */}
                {widget.type === 'kpi' && (
                  <KpiWidget widget={widget} metrics={metrics} />
                )}
                {widget.type === 'area_chart' && (
                  <ChartWidget widget={widget} metrics={metrics} type="area" />
                )}
                {widget.type === 'bar_chart' && (
                  <ChartWidget widget={widget} metrics={metrics} type="bar" />
                )}
              </div>
            ))}
          </GridLayout>
        </div>
      )}
    </div>
  )
}
