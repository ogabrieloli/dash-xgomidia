import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { MetricsService } from './metrics.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError } from '../../shared/errors/index.js'

const DateRangeQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom deve ser YYYY-MM-DD'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo deve ser YYYY-MM-DD'),
})

const AdAccountMetricsQuerySchema = DateRangeQuerySchema.extend({
  adAccountId: z.string().uuid(),
  clientId: z.string().uuid(),
})

const ClientSummaryQuerySchema = DateRangeQuerySchema.extend({
  clientId: z.string().uuid(),
})

// Serialize Decimal/BigInt to plain numbers/strings for JSON
function serializeRow(row: {
  date: string
  impressions: number
  clicks: number
  spend: { toString(): string }
  conversions: number
  revenue: { toString(): string } | null
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
  derived: Record<string, number>
}) {
  return {
    date: row.date,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend.toString(),
    conversions: row.conversions,
    revenue: row.revenue?.toString() ?? null,
    reach: row.reach,
    videoViews: row.videoViews,
    leads: row.leads,
    completeRegistration: row.completeRegistration,
    landingPageViews: row.landingPageViews,
    linkClicks: row.linkClicks,
    purchases: row.purchases,
    addToCart: row.addToCart,
    initiateCheckout: row.initiateCheckout,
    viewContent: row.viewContent,
    postEngagement: row.postEngagement,
    videoViews3s: row.videoViews3s,
    derived: row.derived,
  }
}

function serializeTotals(totals: {
  impressions: number
  clicks: number
  spend: { toString(): string }
  conversions: number
  revenue: { toString(): string }
  reach: number
  videoViews: number
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
  derived: Record<string, number>
}) {
  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    spend: totals.spend.toString(),
    conversions: totals.conversions,
    revenue: totals.revenue.toString(),
    reach: totals.reach,
    videoViews: totals.videoViews,
    leads: totals.leads,
    completeRegistration: totals.completeRegistration,
    landingPageViews: totals.landingPageViews,
    linkClicks: totals.linkClicks,
    purchases: totals.purchases,
    addToCart: totals.addToCart,
    initiateCheckout: totals.initiateCheckout,
    viewContent: totals.viewContent,
    postEngagement: totals.postEngagement,
    videoViews3s: totals.videoViews3s,
    derived: totals.derived,
  }
}

export async function metricsRoutes(app: FastifyInstance) {
  const service = new MetricsService(app.db)

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message ?? 'Dados inválidos' },
      })
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }
    app.log.error(error)
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } })
  })

  // GET /api/metrics/agency-summary?dateFrom=&dateTo=
  // Deve vir antes de /:id para não ser capturado como param
  app.get('/agency-summary', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const query = DateRangeQuerySchema.parse(request.query)

    const result = await service.getAgencySummary(request.user.agencyId, {
      from: query.dateFrom,
      to: query.dateTo,
    })

    return {
      data: {
        totals: serializeTotals(result.totals),
        topClients: result.topClients.map((c) => ({
          clientId: c.clientId,
          clientName: c.clientName,
          spend: c.spend.toString(),
          revenue: c.revenue.toString(),
          roas: c.roas,
        })),
        totalClients: result.totalClients,
        averageInvestment: result.averageInvestment,
      },
    }
  })

  // GET /api/metrics/summary?clientId=&dateFrom=&dateTo=
  app.get('/summary', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = ClientSummaryQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const result = await service.getClientSummary(query.clientId, {
      from: query.dateFrom,
      to: query.dateTo,
    })

    return { data: { totals: serializeTotals(result.totals) } }
  })

  // GET /api/metrics/strategy?strategyId=&clientId=&dateFrom=&dateTo=&compare=true
  app.get('/strategy', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = DateRangeQuerySchema.extend({
      strategyId: z.string().uuid(),
      clientId: z.string().uuid(),
      adAccountId: z.string().uuid().optional(),
      compare: z.enum(['true', 'false']).optional(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const result = await service.getByStrategy(
      query.strategyId,
      query.clientId,
      { from: query.dateFrom, to: query.dateTo },
      query.adAccountId,
      query.compare === 'true',
    )

    return {
      data: {
        rows: result.rows.map(serializeRow),
        totals: serializeTotals(result.totals),
        previousTotals: result.previousTotals ? serializeTotals(result.previousTotals) : undefined,
      },
    }
  })

  // GET /api/metrics/campaigns?strategyId=&clientId=&dateFrom=&dateTo=
  app.get('/campaigns', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = DateRangeQuerySchema.extend({
      strategyId: z.string().uuid(),
      clientId: z.string().uuid(),
      adAccountId: z.string().uuid().optional(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const campaigns = await service.getCampaignBreakdown(
      query.strategyId,
      query.clientId,
      { from: query.dateFrom, to: query.dateTo },
      query.adAccountId,
    )

    return {
      data: campaigns.map((c) => ({
        externalCampaignId: c.externalCampaignId,
        campaignName: c.campaignName,
        totals: serializeTotals(c.totals),
      })),
    }
  })

  // GET /api/metrics?adAccountId=&clientId=&dateFrom=&dateTo=
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = AdAccountMetricsQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const result = await service.getByAdAccount(query.adAccountId, {
      from: query.dateFrom,
      to: query.dateTo,
    })

    return {
      data: {
        rows: result.rows.map(serializeRow),
        totals: serializeTotals(result.totals),
      },
    }
  })
}
