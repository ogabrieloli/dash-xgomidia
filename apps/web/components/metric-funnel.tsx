'use client'

import { formatNumber, formatCurrency, formatPercent } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Step builders ────────────────────────────────────────────────────────────

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
        rate: totals.clicks > 0 ? totals.landingPageViews! / totals.clicks : 0,
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
    const steps: FunnelStep[] = [{ label: 'Cliques', value: totals.clicks }]
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
        rate: totals.viewContent
          ? totals.addToCart! / totals.viewContent
          : totals.clicks > 0 ? totals.addToCart! / totals.clicks : 0,
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
    const steps: FunnelStep[] = [{ label: 'Impressões', value: totals.impressions }]
    if ((totals.reach ?? 0) > 0) {
      steps.push({
        label: 'Alcance',
        value: totals.reach!,
        rateLabel: `freq. ${(totals.impressions / totals.reach!).toFixed(1)}x`,
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

function summaryMetrics(
  totals: FunnelTotals,
  objective: string | null | undefined,
): Array<{ label: string; value: string }> {
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
      {
        label: 'Frequência',
        value: totals.reach ? `${(totals.impressions / totals.reach).toFixed(1)}x` : '—',
      },
    ]
  }
  return [
    { label: 'CTR', value: formatPercent(totals.derived.ctr) },
    { label: 'Cliques', value: formatNumber(totals.clicks) },
  ]
}

function buildCustomSteps(totals: FunnelTotals, metrics: string[]): FunnelStep[] {
  const getValue = (key: string): number => {
    const map: Record<string, number> = {
      impressions: totals.impressions,
      clicks: totals.clicks,
      reach: totals.reach ?? 0,
      videoViews: totals.videoViews ?? 0,
      videoViews3s: totals.videoViews3s ?? 0,
      leads: totals.leads ?? 0,
      completeRegistration: totals.completeRegistration ?? 0,
      landingPageViews: totals.landingPageViews ?? 0,
      linkClicks: totals.linkClicks ?? 0,
      purchases: totals.purchases ?? 0,
      addToCart: totals.addToCart ?? 0,
      initiateCheckout: totals.initiateCheckout ?? 0,
      viewContent: totals.viewContent ?? 0,
      postEngagement: totals.postEngagement ?? 0,
      conversions: 0,
    }
    return map[key] ?? 0
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
    return {
      label: LABELS[key] ?? key,
      value,
      rateLabel: i > 0 ? 'taxa' : undefined,
      rate: prevValue > 0 ? value / prevValue : undefined,
    }
  })
}

// ─── Cylinder geometry constants ──────────────────────────────────────────────

const CAP_H = 13    // half of each ellipse cap (total cap height = CAP_H*2)
const BODY_H = 44   // cylinder body height
const CYL_H = CAP_H * 2 + BODY_H  // 70px total per cylinder
const GAP_H = 56    // gap between cylinders (particles + rate badge)
const MIN_W = 20    // minimum width % of funnel container

// ─── Color scale: blue-500 → sky ─────────────────────────────────────────────

const PALETTE = [
  { body: '#3B82F6', hi: '#60A5FA', lo: '#1D4ED8' },
  { body: '#4D8EF7', hi: '#73B2F9', lo: '#2460D9' },
  { body: '#5F9AF8', hi: '#86BEFA', lo: '#2B6EDB' },
  { body: '#72A7F9', hi: '#99CAFB', lo: '#3278DD' },
  { body: '#84B2FA', hi: '#ABD4FC', lo: '#3981DF' },
  { body: '#97BEFB', hi: '#BEDEFF', lo: '#408AE1' },
]

// ─── Deterministic particle config (stable across renders) ───────────────────

interface ParticleDef {
  rx: number   // relative x: -0.5 → 0.5 (fraction of funnel width)
  dur: number  // animation duration (s)
  del: number  // animation delay (s)
  sz: number   // diameter (px)
  big: boolean // use funnelParticle vs funnelParticleSmall
}

const PARTICLES: ParticleDef[] = [
  { rx: -0.32, dur: 1.50, del: 0.00, sz: 5, big: true  },
  { rx:  0.12, dur: 1.65, del: 0.20, sz: 4, big: false },
  { rx: -0.08, dur: 1.40, del: 0.42, sz: 5, big: true  },
  { rx:  0.38, dur: 1.70, del: 0.14, sz: 3, big: false },
  { rx: -0.44, dur: 1.55, del: 0.60, sz: 4, big: true  },
  { rx:  0.06, dur: 1.35, del: 0.78, sz: 5, big: true  },
  { rx:  0.26, dur: 1.60, del: 0.48, sz: 3, big: false },
  { rx: -0.20, dur: 1.75, del: 0.32, sz: 4, big: false },
  { rx:  0.46, dur: 1.45, del: 0.90, sz: 3, big: false },
  { rx: -0.52, dur: 1.50, del: 0.68, sz: 4, big: true  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CylinderProps {
  widthPct: number
  pal: typeof PALETTE[0]
  label: string
}

function Cylinder({ widthPct, pal, label }: CylinderProps) {
  const bodyGrad = `linear-gradient(to right,
    ${pal.lo} 0%,
    ${pal.body} 18%,
    ${pal.hi}  42%,
    ${pal.body} 63%,
    ${pal.lo} 100%
  )`

  return (
    <div style={{ width: `${widthPct}%`, margin: '0 auto' }}>
      {/* Top cap */}
      <div
        style={{
          height: CAP_H * 2,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at 38% 36%, ${pal.hi}, ${pal.body} 55%, ${pal.lo})`,
          boxShadow: `0 3px 10px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.18)`,
          position: 'relative',
          zIndex: 2,
        }}
      />
      {/* Body */}
      <div
        style={{
          height: BODY_H,
          background: bodyGrad,
          marginTop: -CAP_H,
          marginBottom: -CAP_H,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'rgba(255,255,255,0.95)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.40)',
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      </div>
      {/* Bottom cap */}
      <div
        style={{
          height: CAP_H * 2,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at 40% 64%, ${pal.lo}, ${pal.body} 60%, ${pal.hi})`,
          boxShadow: `inset 0 4px 10px rgba(0,0,0,0.28)`,
          position: 'relative',
          zIndex: 2,
        }}
      />
    </div>
  )
}

interface ParticleStreamProps {
  spreadPct: number  // half-spread in % of container (= ~35% of funnel width)
}

function ParticleStream({ spreadPct }: ParticleStreamProps) {
  return (
    <>
      {PARTICLES.map((p, idx) => {
        const leftPct = 50 + p.rx * spreadPct * 2  // center ± spread
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `calc(${leftPct}% - ${p.sz / 2}px)`,
              top: -p.sz / 2,
              width: p.sz,
              height: p.sz,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, rgba(147,197,253,0.95), rgba(59,130,246,0.65))`,
              boxShadow: '0 0 6px rgba(59,130,246,0.40)',
              animationName: p.big ? 'funnelParticle' : 'funnelParticleSmall',
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.del}s`,
              animationTimingFunction: 'ease-in',
              animationIterationCount: 'infinite',
              animationFillMode: 'both',
            }}
          />
        )
      })}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MetricFunnelProps {
  totals: FunnelTotals
  objective?: string | null
  customMetrics?: string[]
}

export function MetricFunnel({ totals, objective, customMetrics }: MetricFunnelProps) {
  const steps =
    customMetrics && customMetrics.length > 0
      ? buildCustomSteps(totals, customMetrics)
      : buildSteps(totals, objective)
  const summary =
    customMetrics && customMetrics.length > 0 ? [] : summaryMetrics(totals, objective)
  const maxVal = steps[0]?.value ?? 1

  const title =
    objective === 'LEAD' ? 'Geração de Leads'
    : objective === 'SALES' ? 'Vendas'
    : objective === 'BRANDING' ? 'Branding'
    : 'Performance'

  return (
    <div className="rounded-xl border border-[#E8E2D8] bg-white p-5">
      <h3 className="text-sm font-semibold text-stone-700 mb-5">Funil de {title}</h3>

      <div className="flex gap-4">
        {/* ── Funnel column ── */}
        <div className="flex-1 min-w-0">
          {steps.map((step, i) => {
            const wPct = Math.max(MIN_W, maxVal > 0 ? (step.value / maxVal) * 100 : MIN_W)
            // Particle spread = ~35% of current cylinder width
            const spreadPct = wPct * 0.35

            return (
              <div key={step.label}>
                {/* Connector gap: particles + rate badge */}
                {i > 0 && (
                  <div style={{ position: 'relative', height: GAP_H, overflow: 'hidden' }}>
                    <ParticleStream spreadPct={spreadPct} />
                    {/* Rate badge centered in gap */}
                    {(step.rate !== undefined || step.rateLabel) && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 20,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#78716C',
                            background: 'rgba(255,255,255,0.92)',
                            border: '1px solid #E8E2D8',
                            borderRadius: 999,
                            padding: '3px 10px',
                            backdropFilter: 'blur(4px)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {step.rate !== undefined
                            ? `${formatPercent(step.rate)}${step.rateLabel ? ` ${step.rateLabel}` : ''}`
                            : step.rateLabel}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Cylinder */}
                <Cylinder
                  widthPct={wPct}
                  pal={PALETTE[Math.min(i, PALETTE.length - 1)]}
                  label={step.label}
                />
              </div>
            )
          })}
        </div>

        {/* ── Values column ── */}
        <div className="flex-shrink-0 w-[72px] flex flex-col">
          {steps.map((step, i) => (
            <div key={step.label}>
              {i > 0 && <div style={{ height: GAP_H }} />}
              <div
                style={{ height: CYL_H }}
                className="flex flex-col justify-center items-end"
              >
                <p className="font-display text-xl font-bold text-stone-900 tabular-nums leading-tight">
                  {formatNumber(step.value)}
                </p>
                {i > 0 && (
                  <p className="text-[10px] text-stone-400 tabular-nums mt-0.5">
                    {formatPercent(step.value / maxVal)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary KPIs ── */}
      {summary.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 pt-4 border-t border-[#F5F0E8]">
          {summary.map((s) => (
            <div key={s.label}>
              <p className="text-[10px] font-medium text-stone-400 uppercase tracking-widest">
                {s.label}
              </p>
              <p className="font-display text-base font-bold text-stone-900 leading-tight">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
