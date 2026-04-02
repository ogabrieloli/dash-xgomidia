'use client'

import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface DerivedMetrics {
  ctr: number
  roas: number
  cpl: number
  conversionRate: number
  costPerPurchase: number
  cartToCheckoutRate: number
  checkoutToPurchaseRate: number
  cpm: number
}

interface MetricTotals {
  impressions: number
  reach?: number
  leads?: number
  purchases?: number
  addToCart?: number
  initiateCheckout?: number
  postEngagement?: number
  videoViews3s?: number
  derived: DerivedMetrics
}

interface Insight {
  severity: 'critical' | 'warning' | 'info'
  message: string
}

function computeInsights(
  totals: MetricTotals,
  objective: string | null | undefined,
  budget?: number | null,
): Insight[] {
  const insights: Insight[] = []
  const d = totals.derived

  // Universais
  if (d.ctr < 0.01 && totals.impressions > 0) {
    insights.push({ severity: 'warning', message: 'CTR abaixo de 1% — criativo com baixo interesse' })
  }
  if (d.roas > 0 && d.roas < 1) {
    insights.push({ severity: 'critical', message: 'ROAS < 1 — campanhas com prejuízo' })
  }

  if (objective === 'LEAD') {
    if ((totals.leads ?? 0) === 0) {
      insights.push({ severity: 'warning', message: 'Nenhum lead gerado no período' })
    }
    if (budget && d.cpl > budget * 0.2) {
      insights.push({ severity: 'warning', message: `CPL acima de R$${(budget * 0.2).toFixed(0)} (20% do orçamento)` })
    }
    if (d.conversionRate > 0 && d.conversionRate < 0.02) {
      insights.push({ severity: 'warning', message: 'Taxa de conversão baixa (<2%) — avaliar landing page' })
    }
  }

  if (objective === 'SALES') {
    if (d.roas < 2 && d.roas > 0) {
      insights.push({ severity: 'warning', message: 'ROAS abaixo de 2x — margem comprometida' })
    }
    if (d.cartToCheckoutRate > 0 && d.cartToCheckoutRate < 0.3) {
      insights.push({ severity: 'warning', message: 'Abandono alto no carrinho (>70% não avançam para checkout)' })
    }
    if ((totals.purchases ?? 0) === 0 && (totals.addToCart ?? 0) > 0) {
      insights.push({ severity: 'critical', message: 'Carrinhos adicionados sem compras — verificar checkout' })
    }
  }

  if (objective === 'BRANDING') {
    const frequency = totals.reach ? totals.impressions / totals.reach : 0
    if (frequency > 5) {
      insights.push({ severity: 'warning', message: `Frequência alta (${frequency.toFixed(1)}x) — risco de fadiga de anúncio` })
    }
    if (d.cpm > 50) {
      insights.push({ severity: 'warning', message: `CPM acima de R$50 — audiência cara` })
    }
  }

  return insights
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    icon_color: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    icon_color: 'text-yellow-500',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-700',
    icon_color: 'text-blue-500',
  },
}

interface StrategyInsightsProps {
  totals: MetricTotals
  objective?: string | null
  budget?: number | null
}

export function StrategyInsights({ totals, objective, budget }: StrategyInsightsProps) {
  const insights = computeInsights(totals, objective, budget)

  if (insights.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {insights.map((insight, i) => {
        const cfg = SEVERITY_CONFIG[insight.severity]
        const Icon = cfg.icon
        return (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cfg.bg}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${cfg.icon_color}`} />
            <span className={cfg.text}>{insight.message}</span>
          </div>
        )
      })}
    </div>
  )
}
