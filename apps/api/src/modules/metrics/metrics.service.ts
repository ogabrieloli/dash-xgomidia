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
  derived: {
    ctr: number
    cpc: number
    cpa: number
    roas: number
    cpm: number
  }
}

export interface MetricTotals {
  impressions: number
  clicks: number
  spend: Decimal
  conversions: number
  revenue: Decimal
  derived: {
    ctr: number
    cpc: number
    cpa: number
    roas: number
    cpm: number
  }
}

export interface MetricsResult {
  rows: MetricRow[]
  totals: MetricTotals
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
) {
  return calculateDerivedMetrics({
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

  return {
    impressions,
    clicks,
    spend,
    conversions,
    revenue,
    derived: computeDerived(
      impressions,
      clicks,
      spend.toNumber(),
      conversions,
      revenue.toNumber(),
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
      derived: computeDerived(impressions, clicks, spend, conversions, revenue),
    }
  })
}

export class MetricsService {
  constructor(private readonly db: PrismaClient) {}

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
   * Busca métricas de uma estratégia.
   * Se a estratégia tiver campanhas vinculadas, filtra por `externalCampaignId`.
   * Caso contrário, retorna todas as métricas das contas do cliente.
   */
  async getByStrategy(strategyId: string, clientId: string, dateRange: DateRange): Promise<MetricsResult> {
    // Campanhas vinculadas à estratégia
    const linkedCampaigns = await this.db.strategyCampaign.findMany({
      where: { strategyId },
      select: { externalId: true, adAccountId: true },
    })

    const accounts = await this.db.adAccount.findMany({
      where: { clientId },
      select: { id: true },
    })

    const accountIds = accounts.map((a) => a.id)
    if (accountIds.length === 0) {
      return { rows: [], totals: buildTotals([]) }
    }

    const where = linkedCampaigns.length > 0
      ? {
          adAccountId: { in: linkedCampaigns.map((c) => c.adAccountId) },
          externalCampaignId: { in: linkedCampaigns.map((c) => c.externalId) },
          date: { gte: new Date(dateRange.from), lte: new Date(dateRange.to) },
        }
      : {
          adAccountId: { in: accountIds },
          date: { gte: new Date(dateRange.from), lte: new Date(dateRange.to) },
        }

    const snapshots = await this.db.metricSnapshot.findMany({ where, orderBy: { date: 'asc' } })
    const rows = snapshotsToRows(snapshots)
    return { rows, totals: buildTotals(rows) }
  }
}
