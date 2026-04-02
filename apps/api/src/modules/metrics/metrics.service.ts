import type { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { DateRange } from '@xgo/shared-types'
import { calculateDerivedMetrics } from '@xgo/metrics-schema'

export interface MetricRow {
  date: string
  impressions: number
  clicks: number
  spend: Decimal
  conversions: number
  revenue: Decimal | null
  reach: number | null
  videoViews: number | null
  // LEAD
  leads: number
  completeRegistration: number
  landingPageViews: number
  linkClicks: number
  // SALES
  purchases: number
  addToCart: number
  initiateCheckout: number
  viewContent: number
  // BRANDING
  postEngagement: number
  videoViews3s: number
  derived: {
    ctr: number
    cpc: number
    cpa: number
    roas: number
    cpm: number
    cpl: number
    conversionRate: number
    costPerPurchase: number
    cartToCheckoutRate: number
    checkoutToPurchaseRate: number
  }
}

export interface MetricTotals {
  impressions: number
  clicks: number
  spend: Decimal
  conversions: number
  revenue: Decimal
  reach: number
  videoViews: number
  // LEAD
  leads: number
  completeRegistration: number
  landingPageViews: number
  linkClicks: number
  // SALES
  purchases: number
  addToCart: number
  initiateCheckout: number
  viewContent: number
  // BRANDING
  postEngagement: number
  videoViews3s: number
  derived: {
    ctr: number
    cpc: number
    cpa: number
    roas: number
    cpm: number
    cpl: number
    conversionRate: number
    costPerPurchase: number
    cartToCheckoutRate: number
    checkoutToPurchaseRate: number
  }
}

export interface MetricsResult {
  rows: MetricRow[]
  totals: MetricTotals
  previousTotals?: MetricTotals
}

export interface ClientSummary {
  totals: MetricTotals
}

export interface TopClient {
  clientId: string
  clientName: string
  spend: Decimal
  revenue: Decimal
  roas: number
}

export interface AgencySummaryResult {
  totals: MetricTotals & { derived: MetricTotals['derived'] }
  topClients: TopClient[]
  totalClients: number
  averageInvestment: number // totalSpend / totalClients
}

function computeDerived(
  impressions: number,
  clicks: number,
  spend: number,
  conversions: number,
  revenue: number,
  leads: number,
  linkClicks: number,
  purchases: number,
  addToCart: number,
  initiateCheckout: number,
) {
  const base = calculateDerivedMetrics({
    date: '',
    platform: 'META_ADS',
    externalAccountId: '',
    impressions,
    clicks,
    spend,
    conversions,
    revenue,
    rawData: null,
  })

  return {
    ...base,
    cpl: leads > 0 ? spend / leads : 0,
    conversionRate: linkClicks > 0 ? leads / linkClicks : 0,
    costPerPurchase: purchases > 0 ? spend / purchases : 0,
    cartToCheckoutRate: addToCart > 0 ? initiateCheckout / addToCart : 0,
    checkoutToPurchaseRate: initiateCheckout > 0 ? purchases / initiateCheckout : 0,
  }
}

function buildTotals(rows: MetricRow[]): MetricTotals {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const spend = rows.reduce((s, r) => s.add(r.spend), new Decimal(0))
  const conversions = rows.reduce((s, r) => s + r.conversions, 0)
  const revenue = rows.reduce(
    (s, r) => s.add(r.revenue ?? new Decimal(0)),
    new Decimal(0),
  )
  const reach = rows.reduce((s, r) => s + (r.reach ?? 0), 0)
  const videoViews = rows.reduce((s, r) => s + (r.videoViews ?? 0), 0)
  const leads = rows.reduce((s, r) => s + r.leads, 0)
  const completeRegistration = rows.reduce((s, r) => s + r.completeRegistration, 0)
  const landingPageViews = rows.reduce((s, r) => s + r.landingPageViews, 0)
  const linkClicks = rows.reduce((s, r) => s + r.linkClicks, 0)
  const purchases = rows.reduce((s, r) => s + r.purchases, 0)
  const addToCart = rows.reduce((s, r) => s + r.addToCart, 0)
  const initiateCheckout = rows.reduce((s, r) => s + r.initiateCheckout, 0)
  const viewContent = rows.reduce((s, r) => s + r.viewContent, 0)
  const postEngagement = rows.reduce((s, r) => s + r.postEngagement, 0)
  const videoViews3s = rows.reduce((s, r) => s + r.videoViews3s, 0)

  return {
    impressions,
    clicks,
    spend,
    conversions,
    revenue,
    reach,
    videoViews,
    leads,
    completeRegistration,
    landingPageViews,
    linkClicks,
    purchases,
    addToCart,
    initiateCheckout,
    viewContent,
    postEngagement,
    videoViews3s,
    derived: computeDerived(
      impressions,
      clicks,
      spend.toNumber(),
      conversions,
      revenue.toNumber(),
      leads,
      linkClicks,
      purchases,
      addToCart,
      initiateCheckout,
    ),
  }
}

function snapshotsToRows(
  snapshots: Array<{
    date: Date
    impressions: bigint
    clicks: bigint
    spend: Decimal
    conversions: number
    revenue: Decimal | null
    reach: number | null
    videoViews: number | null
    leads: number
    completeRegistration: number
    landingPageViews: number
    linkClicks: number
    purchases: number
    addToCart: number
    initiateCheckout: number
    viewContent: number
    postEngagement: number
    videoViews3s: number
  }>,
): MetricRow[] {
  return snapshots.map((s) => {
    const impressions = Number(s.impressions)
    const clicks = Number(s.clicks)
    const spend = s.spend.toNumber()
    const conversions = s.conversions
    const revenue = s.revenue?.toNumber() ?? 0

    return {
      date: s.date.toISOString().slice(0, 10),
      impressions,
      clicks,
      spend: s.spend,
      conversions,
      revenue: s.revenue,
      reach: s.reach,
      videoViews: s.videoViews,
      leads: s.leads,
      completeRegistration: s.completeRegistration,
      landingPageViews: s.landingPageViews,
      linkClicks: s.linkClicks,
      purchases: s.purchases,
      addToCart: s.addToCart,
      initiateCheckout: s.initiateCheckout,
      viewContent: s.viewContent,
      postEngagement: s.postEngagement,
      videoViews3s: s.videoViews3s,
      derived: computeDerived(
        impressions,
        clicks,
        spend,
        conversions,
        revenue,
        s.leads,
        s.linkClicks,
        s.purchases,
        s.addToCart,
        s.initiateCheckout,
      ),
    }
  })
}

export class MetricsService {
  constructor(private readonly db: PrismaClient) { }

  async getByAdAccount(adAccountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const snapshots = await this.db.metricSnapshot.findMany({
      where: {
        adAccountId,
        date: {
          gte: new Date(dateRange.from),
          lte: new Date(dateRange.to),
        },
      },
      orderBy: { date: 'asc' },
    })

    const rows = snapshotsToRows(snapshots)
    return { rows, totals: buildTotals(rows) }
  }

  async getClientSummary(clientId: string, dateRange: DateRange): Promise<ClientSummary> {
    // Get all adAccount IDs for this client
    const accounts = await this.db.adAccount.findMany({
      where: { clientId },
      select: { id: true },
    })

    const accountIds = accounts.map((a) => a.id)
    if (accountIds.length === 0) {
      return { totals: buildTotals([]) }
    }

    const snapshots = await this.db.metricSnapshot.findMany({
      where: {
        adAccountId: { in: accountIds },
        date: {
          gte: new Date(dateRange.from),
          lte: new Date(dateRange.to),
        },
      },
    })

    const rows = snapshotsToRows(snapshots)
    return { totals: buildTotals(rows) }
  }

  async getAgencySummary(agencyId: string, dateRange: DateRange): Promise<AgencySummaryResult> {
    // Get all clients of this agency with their accounts
    const clients = await this.db.client.findMany({
      where: { agencyId, deletedAt: null },
      include: {
        adAccounts: {
          select: { id: true },
        },
      },
    })

    const allAccountIds = clients.flatMap((c) => c.adAccounts.map((a) => a.id))

    if (allAccountIds.length === 0) {
      return {
        totals: buildTotals([]),
        topClients: [],
        totalClients: clients.length,
        averageInvestment: 0,
      }
    }

    const snapshots = await this.db.metricSnapshot.findMany({
      where: {
        adAccountId: { in: allAccountIds },
        date: {
          gte: new Date(dateRange.from),
          lte: new Date(dateRange.to),
        },
      },
    })

    const rows = snapshotsToRows(snapshots)
    const totals = buildTotals(rows)

    // Build per-client spend map
    const accountToClient = new Map<string, { id: string; name: string }>()
    for (const client of clients) {
      for (const account of client.adAccounts) {
        accountToClient.set(account.id, { id: client.id, name: client.name })
      }
    }

    const clientSpend = new Map<string, { clientId: string; clientName: string; spend: Decimal; revenue: Decimal }>()

    for (const snapshot of snapshots) {
      const clientInfo = accountToClient.get(snapshot.adAccountId)
      if (!clientInfo) continue

      const existing = clientSpend.get(clientInfo.id)
      if (existing) {
        existing.spend = existing.spend.add(snapshot.spend)
        existing.revenue = existing.revenue.add(snapshot.revenue ?? new Decimal(0))
      } else {
        clientSpend.set(clientInfo.id, {
          clientId: clientInfo.id,
          clientName: clientInfo.name,
          spend: new Decimal(snapshot.spend),
          revenue: new Decimal(snapshot.revenue ?? 0),
        })
      }
    }

    const topClients: TopClient[] = Array.from(clientSpend.values())
      .map((c) => ({
        clientId: c.clientId,
        clientName: c.clientName,
        spend: c.spend,
        revenue: c.revenue,
        roas: c.spend.toNumber() > 0
          ? c.revenue.toNumber() / c.spend.toNumber()
          : 0,
      }))
      .sort((a, b) => b.spend.toNumber() - a.spend.toNumber())

    const totalClients = clients.length
    const averageInvestment = totalClients > 0
      ? totals.spend.toNumber() / totalClients
      : 0

    return { totals, topClients, totalClients, averageInvestment }
  }

  /**
   * Calcula o período anterior com a mesma duração que dateRange.
   * Ex: 01/04–30/04 (30 dias) → 02/03–31/03
   */
  private previousPeriod(dateRange: DateRange): DateRange {
    const from = new Date(dateRange.from + 'T00:00:00Z')
    const to = new Date(dateRange.to + 'T00:00:00Z')
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    const prevTo = new Date(from.getTime() - 86_400_000)
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000)
    return {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10),
    }
  }

  /**
   * Busca métricas de uma estratégia.
   * Se a estratégia tiver campanhas vinculadas, filtra por `externalCampaignId`.
   * Permite filtrar opcionalmente por uma conta específica.
   * Quando `compare=true`, inclui `previousTotals` (mesmo período imediatamente anterior).
   */
  async getByStrategy(
    strategyId: string,
    clientId: string,
    dateRange: DateRange,
    adAccountId?: string,
    compare = false,
  ): Promise<MetricsResult> {
    // Campanhas vinculadas à estratégia
    const linkedCampaigns = await this.db.strategyCampaign.findMany({
      where: {
        strategyId,
        ...(adAccountId && { adAccountId })
      },
      select: { externalId: true, adAccountId: true },
    })

    const accounts = await this.db.adAccount.findMany({
      where: { clientId, ...(adAccountId && { id: adAccountId }) },
      select: { id: true },
    })

    const accountIds = accounts.map((a) => a.id)
    if (accountIds.length === 0) {
      return { rows: [], totals: buildTotals([]) }
    }

    const buildWhere = (range: DateRange) => linkedCampaigns.length > 0
      ? {
        adAccountId: { in: linkedCampaigns.map((c) => c.adAccountId) },
        externalCampaignId: { in: linkedCampaigns.map((c) => c.externalId) },
        date: { gte: new Date(range.from), lte: new Date(range.to) },
      }
      : {
        adAccountId: { in: accountIds },
        date: { gte: new Date(range.from), lte: new Date(range.to) },
      }

    const [snapshots, prevSnapshots] = await Promise.all([
      this.db.metricSnapshot.findMany({ where: buildWhere(dateRange), orderBy: { date: 'asc' } }),
      compare
        ? this.db.metricSnapshot.findMany({ where: buildWhere(this.previousPeriod(dateRange)) })
        : Promise.resolve(null),
    ])

    const rows = snapshotsToRows(snapshots)
    const totals = buildTotals(rows)

    const result: MetricsResult = { rows, totals }
    if (prevSnapshots) {
      result.previousTotals = buildTotals(snapshotsToRows(prevSnapshots))
    }
    return result
  }
}
