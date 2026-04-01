'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useMutation } from '@tanstack/react-query'
import { Plus, Save, Trash2, GripVertical } from 'lucide-react'
import { api } from '@/lib/api'
import type { LayoutItem, Layout } from 'react-grid-layout'

// Dynamic import to avoid SSR issues
const GridLayout = dynamic(
  () => import('react-grid-layout').then((mod) => mod.GridLayout),
  { ssr: false },
)

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

const WIDGET_TYPES: Array<{ type: DashboardWidget['type']; label: string }> = [
  { type: 'kpi', label: 'KPI' },
  { type: 'area_chart', label: 'Gráfico de Área' },
  { type: 'bar_chart', label: 'Gráfico de Barras' },
]

const METRIC_OPTIONS = [
  { value: 'spend', label: 'Investimento' },
  { value: 'revenue', label: 'Receita' },
  { value: 'roas', label: 'ROAS' },
  { value: 'cpa', label: 'CPA' },
  { value: 'ctr', label: 'CTR' },
  { value: 'impressions', label: 'Impressões' },
  { value: 'clicks', label: 'Cliques' },
  { value: 'conversions', label: 'Conversões' },
]

const DEFAULT_WIDGET_SIZE: Record<DashboardWidget['type'], { w: number; h: number }> = {
  kpi: { w: 3, h: 2 },
  area_chart: { w: 6, h: 4 },
  bar_chart: { w: 6, h: 4 },
}

interface DashboardBuilderProps {
  strategyId: string
  initialConfig?: DashboardConfig | null
}

export function DashboardBuilder({ strategyId, initialConfig }: DashboardBuilderProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialConfig?.widgets ?? [])
  const [layout, setLayout] = useState<LayoutItem[]>(initialConfig?.layout ?? [])
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/strategies/${strategyId}/dashboard-config`, {
        dashboardConfig: { layout, widgets },
      })
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const addWidget = useCallback((type: DashboardWidget['type'], metric: string) => {
    const id = `widget-${Date.now()}`
    const size = DEFAULT_WIDGET_SIZE[type]
    const newWidget: DashboardWidget = {
      id,
      type,
      metric,
      label: METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? metric,
    }

    const newLayoutItem: LayoutItem = {
      i: id,
      x: 0,
      y: Infinity, // adds to bottom
      ...size,
    }

    setWidgets((prev) => [...prev, newWidget])
    setLayout((prev) => [...prev, newLayoutItem])
  }, [])

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id))
    setLayout((prev) => prev.filter((l) => l.i !== id))
  }, [])

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout])
  }, [])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground">Adicionar widget:</span>
        {WIDGET_TYPES.map((wt) => (
          <div key={wt.type} className="flex items-center gap-1">
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              defaultValue="spend"
              id={`metric-select-${wt.type}`}
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById(`metric-select-${wt.type}`) as HTMLSelectElement
                addWidget(wt.type, sel.value)
              }}
              className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              {wt.label}
            </button>
          </div>
        ))}

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className={`ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            saved
              ? 'bg-green-500/15 text-green-600'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          } disabled:opacity-50`}
        >
          <Save className="h-3 w-3" />
          {saved ? 'Salvo!' : saveMutation.isPending ? 'Salvando...' : 'Salvar layout'}
        </button>
      </div>

      {widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Adicione widgets acima para construir seu dashboard personalizado.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-2 overflow-x-auto">
          <GridLayout
            layout={layout}
            width={960}
            gridConfig={{ cols: 12, rowHeight: 40 }}
            dragConfig={{ handle: '.drag-handle' }}
            onLayoutChange={handleLayoutChange}
          >
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className="rounded-lg border bg-background flex flex-col overflow-hidden"
              >
                {/* Widget header */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30 flex-shrink-0">
                  <span className="drag-handle cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="text-xs font-medium text-foreground truncate flex-1">{widget.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{widget.type}</span>
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="rounded p-0.5 hover:bg-destructive/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>

                {/* Placeholder content */}
                <div className="flex-1 flex items-center justify-center p-2">
                  <span className="text-xs text-muted-foreground/50 italic">
                    {widget.type === 'kpi' ? `KPI: ${widget.label}` : `Gráfico: ${widget.label}`}
                  </span>
                </div>
              </div>
            ))}
          </GridLayout>
        </div>
      )}
    </div>
  )
}
