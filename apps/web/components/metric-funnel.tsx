'use client'

import { formatNumber, formatCurrency, formatPercent } from '@/lib/utils'

interface FunnelTotals {
  impressions: number
  clicks: number
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
  derived: {
    ctr: number
    cpl: number
    roas: number
    cpm: number
    costPerPurchase: number
    conversionRate: number
    cartToCheckoutRate: number
    checkoutToPurchaseRate: number
  }
}

interface FunnelStep {
  label: string
  value: number
  rateLabel?: string
  rate?: number
}

function buildSteps(totals: FunnelTotals, objective: string | null | undefined): FunnelStep[] {
  if (objective === 'LEAD') {
    const steps: FunnelStep[] = [
      { label: 'Impressões', value: totals.impressions },
      {
        label: 'Cliques no link',
        value: totals.linkClicks ?? totals.clicks,
        rateLabel: 'CTR',
        rate: totals.derived.ctr,
      },
    ]
    if ((totals.landingPageViews ?? 0) > 0) {
      steps.push({
        label: 'Visitas à LP',
        value: totals.landingPageViews!,
        rateLabel: 'chegaram à LP',
        rate: totals.clicks > 0 ? (totals.landingPageViews!) / totals.clicks : 0,
      })
    }
    steps.push({
      label: 'Leads',
      value: totals.leads ?? 0,
      rateLabel: 'taxa de conversão',
      rate: totals.derived.conversionRate,
    })
    return steps
  }

  if (objective === 'SALES') {
    const steps: FunnelStep[] = [
      { label: 'Cliques', value: totals.clicks },
    ]
    if ((totals.viewContent ?? 0) > 0) {
      steps.push({
        label: 'Ver produto',
        value: totals.viewContent!,
        rateLabel: 'do tráfego',
        rate: totals.clicks > 0 ? totals.viewContent! / totals.clicks : 0,
      })
    }
    if ((totals.addToCart ?? 0) > 0) {
      steps.push({
        label: 'Carrinho',
        value: totals.addToCart!,
        rateLabel: 'adicionaram',
        rate: totals.viewContent ? totals.addToCart! / totals.viewContent : (totals.clicks > 0 ? totals.addToCart! / totals.clicks : 0),
      })
    }
    if ((totals.initiateCheckout ?? 0) > 0) {
      steps.push({
        label: 'Checkout',
        value: totals.initiateCheckout!,
        rateLabel: 'avançaram',
        rate: totals.derived.cartToCheckoutRate,
      })
    }
    steps.push({
      label: 'Compras',
      value: totals.purchases ?? 0,
      rateLabel: 'finalizaram',
      rate: totals.derived.checkoutToPurchaseRate,
    })
    return steps
  }

  if (objective === 'BRANDING') {
    const steps: FunnelStep[] = [
      { label: 'Impressões', value: totals.impressions },
    ]
    if ((totals.reach ?? 0) > 0) {
      const frequency = totals.impressions / totals.reach!
      steps.push({
        label: 'Alcance',
        value: totals.reach!,
        rateLabel: `freq. ${frequency.toFixed(1)}x`,
        rate: totals.impressions > 0 ? totals.reach! / totals.impressions : 0,
      })
    }
    if ((totals.videoViews3s ?? 0) > 0) {
      steps.push({
        label: 'Plays 3s',
        value: totals.videoViews3s!,
        rateLabel: 'taxa de play',
        rate: totals.impressions > 0 ? totals.videoViews3s! / totals.impressions : 0,
      })
    }
    if ((totals.postEngagement ?? 0) > 0) {
      steps.push({
        label: 'Engajamentos',
        value: totals.postEngagement!,
        rateLabel: 'engajaram',
        rate: totals.impressions > 0 ? totals.postEngagement! / totals.impressions : 0,
      })
    }
    steps.push({
      label: 'Cliques',
      value: totals.clicks,
      rateLabel: 'CTR',
      rate: totals.derived.ctr,
    })
    return steps
  }

  return [
    { label: 'Impressões', value: totals.impressions },
    { label: 'Cliques', value: totals.clicks, rateLabel: 'CTR', rate: totals.derived.ctr },
  ]
}

function summaryMetrics(totals: FunnelTotals, objective: string | null | undefined): Array<{ label: string; value: string }> {
  if (objective === 'LEAD') {
    return [
      { label: 'CPL', value: formatCurrency(totals.derived.cpl) },
      { label: 'Total leads', value: formatNumber(totals.leads ?? 0) },
    ]
  }
  if (objective === 'SALES') {
    return [
      { label: 'ROAS', value: `${totals.derived.roas.toFixed(2)}x` },
      { label: 'Custo/compra', value: formatCurrency(totals.derived.costPerPurchase) },
      { label: 'Compras', value: formatNumber(totals.purchases ?? 0) },
    ]
  }
  if (objective === 'BRANDING') {
    return [
      { label: 'CPM', value: formatCurrency(totals.derived.cpm) },
      { label: 'Frequência', value: totals.reach ? `${(totals.impressions / totals.reach).toFixed(1)}x` : '—' },
    ]
  }
  return [
    { label: 'CTR', value: formatPercent(totals.derived.ctr) },
    { label: 'Cliques', value: formatNumber(totals.clicks) },
  ]
}

interface MetricFunnelProps {
  totals: FunnelTotals
  objective?: string | null
  customMetrics?: string[]
}

function buildCustomSteps(totals: FunnelTotals, metrics: string[]): FunnelStep[] {
  const getValue = (key: string): number => {
    switch (key) {
      case 'impressions': return totals.impressions
      case 'clicks': return totals.clicks
      case 'reach': return totals.reach ?? 0
      case 'videoViews': return totals.videoViews ?? 0
      case 'videoViews3s': return totals.videoViews3s ?? 0
      case 'leads': return totals.leads ?? 0
      case 'completeRegistration': return totals.completeRegistration ?? 0
      case 'landingPageViews': return totals.landingPageViews ?? 0
      case 'linkClicks': return totals.linkClicks ?? 0
      case 'purchases': return totals.purchases ?? 0
      case 'addToCart': return totals.addToCart ?? 0
      case 'initiateCheckout': return totals.initiateCheckout ?? 0
      case 'viewContent': return totals.viewContent ?? 0
      case 'postEngagement': return totals.postEngagement ?? 0
      case 'conversions': return 0
      default: return 0
    }
  }
  const LABELS: Record<string, string> = {
    impressions: 'Impressões', clicks: 'Cliques', reach: 'Alcance', videoViews: 'ThruPlay',
    videoViews3s: 'Plays 3s', leads: 'Leads', completeRegistration: 'Cadastros',
    landingPageViews: 'Visitas LP', linkClicks: 'Cliques no link',
    purchases: 'Compras', addToCart: 'Carrinho', initiateCheckout: 'Checkout',
    viewContent: 'Ver produto', postEngagement: 'Engajamentos', conversions: 'Conversões',
  }

  return metrics.map((key, i) => {
    const value = getValue(key)
    const prevValue = i > 0 ? getValue(metrics[i - 1]) : 0
    const rate = prevValue > 0 ? value / prevValue : undefined
    return {
      label: LABELS[key] ?? key,
      value,
      rateLabel: i > 0 ? 'taxa' : undefined,
      rate,
    }
  })
}

// Terracota opacity progression: darkest at top → lightest at bottom
const STEP_COLORS = [
  'rgba(200,67,42,0.90)',
  'rgba(200,67,42,0.72)',
  'rgba(200,67,42,0.55)',
  'rgba(200,67,42,0.40)',
  'rgba(200,67,42,0.28)',
  'rgba(200,67,42,0.18)',
]

const STEP_H = 52
const MIN_RATIO = 0.16  // minimum funnel width — prevents invisible steps

export function MetricFunnel({ totals, objective, customMetrics }: MetricFunnelProps) {
  const steps = customMetrics && customMetrics.length > 0
    ? buildCustomSteps(totals, customMetrics)
    : buildSteps(totals, objective)
  const summary = customMetrics && customMetrics.length > 0 ? [] : summaryMetrics(totals, objective)
  const maxVal = steps[0]?.value ?? 1

  const title = objective === 'LEAD' ? 'Geração de Leads'
    : objective === 'SALES' ? 'Vendas'
    : objective === 'BRANDING' ? 'Branding'
    : 'Performance'

  return (
    <div className="rounded-xl border border-[#E8E2D8] bg-white p-5">
      <h3 className="text-sm font-semibold text-stone-700 mb-5">
        Funil de {title}
      </h3>

      <div>
        {steps.map((step, i) => {
          // Width ratios for top and bottom edges of this trapezoid
          const currRatio = Math.max(MIN_RATIO, maxVal > 0 ? step.value / maxVal : MIN_RATIO)
          const nextRatio = i < steps.length - 1
            ? Math.max(MIN_RATIO, maxVal > 0 ? steps[i + 1].value / maxVal : MIN_RATIO)
            : Math.max(0.06, currRatio * 0.55)  // last step tapers to a point

          // clip-path polygon coords as percentages of container width
          const lTop = ((1 - currRatio) / 2) * 100
          const rTop = 100 - lTop
          const lBot = ((1 - nextRatio) / 2) * 100
          const rBot = 100 - lBot

          const bgColor = STEP_COLORS[Math.min(i, STEP_COLORS.length - 1)]

          // Percentage of first step (for the "% do total" sub-label)
          const pctOfFirst = maxVal > 0 ? step.value / maxVal : 0

          return (
            <div key={step.label}>
              {/* Conversion rate connector between steps */}
              {i > 0 && (
                <div className="flex items-center justify-center" style={{ height: 36 }}>
                  {(step.rate !== undefined || step.rateLabel) ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-px h-2.5 bg-stone-200" />
                      <span className="text-[10px] font-semibold text-stone-500 bg-[#FAF8F5] border border-[#E8E2D8] rounded-full px-2.5 py-0.5 leading-none">
                        {step.rate !== undefined
                          ? `${formatPercent(step.rate)}${step.rateLabel ? ` ${step.rateLabel}` : ''}`
                          : step.rateLabel}
                      </span>
                      <div className="w-px h-2.5 bg-stone-200" />
                    </div>
                  ) : (
                    <div className="w-px h-full bg-stone-200" />
                  )}
                </div>
              )}

              {/* Step row */}
              <div className="flex items-center gap-3">
                {/* Step index dot */}
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(200,67,42,0.10)' }}
                >
                  <span className="text-[9px] font-bold" style={{ color: '#C8432A' }}>{i + 1}</span>
                </div>

                {/* Trapezoid shape + label overlay */}
                <div className="flex-1 relative" style={{ height: STEP_H }}>
                  {/* Clipped trapezoid (visual shape) */}
                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: `polygon(${lTop}% 0%, ${rTop}% 0%, ${rBot}% 100%, ${lBot}% 100%)`,
                      backgroundColor: bgColor,
                    }}
                  />
                  {/* Label — sibling div, not clipped */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span
                      className="text-[11px] font-semibold tracking-wide select-none"
                      style={{ color: i < 3 ? 'rgba(255,255,255,0.95)' : '#92847A' }}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>

                {/* Value column */}
                <div className="flex-shrink-0 w-[72px] text-right">
                  <p className="font-display text-lg font-bold text-stone-900 tabular-nums leading-tight">
                    {formatNumber(step.value)}
                  </p>
                  {i > 0 && (
                    <p className="text-[10px] text-stone-400 tabular-nums mt-0.5">
                      {formatPercent(pctOfFirst)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary KPIs */}
      {summary.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 pt-4 border-t border-[#F5F0E8]">
          {summary.map((s) => (
            <div key={s.label}>
              <p className="text-[10px] font-medium text-stone-400 uppercase tracking-widest">{s.label}</p>
              <p className="font-display text-base font-bold text-stone-900 leading-tight">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
