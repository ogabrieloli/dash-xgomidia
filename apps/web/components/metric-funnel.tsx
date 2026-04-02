'use client'

import { formatNumber, formatCurrency, formatPercent } from '@/lib/utils'

interface FunnelTotals {
  impressions: number
  clicks: number
  reach?: number
  videoViews?: number
  leads?: number
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
  rateLabel?: string   // "CTR 12%" exibido entre a etapa anterior e esta
  rate?: number        // 0-1
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

  // Fallback genérico
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
}

export function MetricFunnel({ totals, objective }: MetricFunnelProps) {
  const steps = buildSteps(totals, objective)
  const summary = summaryMetrics(totals, objective)
  const maxVal = steps[0]?.value ?? 1

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Funil de{' '}
        {objective === 'LEAD' ? 'Geração de Leads'
          : objective === 'SALES' ? 'Vendas'
          : objective === 'BRANDING' ? 'Branding'
          : 'Performance'}
      </h3>

      <div className="flex flex-col gap-1">
        {steps.map((step, i) => {
          const widthPct = maxVal > 0 ? Math.max(8, (step.value / maxVal) * 100) : 8
          const prev = steps[i - 1]

          return (
            <div key={step.label}>
              {/* Rate connector */}
              {i > 0 && prev && (
                <div className="flex items-center gap-2 pl-2 py-0.5">
                  <div className="w-0.5 h-4 bg-border ml-2" />
                  <span className="text-[10px] text-muted-foreground">
                    {step.rate !== undefined
                      ? `${formatPercent(step.rate)} ${step.rateLabel ?? ''}`
                      : step.rateLabel ?? ''}
                  </span>
                </div>
              )}

              {/* Funnel bar */}
              <div className="flex items-center gap-3">
                <div
                  className="h-8 rounded-md bg-primary/80 flex items-center px-3 transition-all"
                  style={{ width: `${widthPct}%`, minWidth: '4rem' }}
                >
                  <span className="text-xs font-medium text-primary-foreground truncate">
                    {step.label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {formatNumber(step.value)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary KPIs */}
      <div className="mt-4 flex flex-wrap gap-4 pt-3 border-t">
        {summary.map((s) => (
          <div key={s.label} className="text-center min-w-[80px]">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
