import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { StrategiesService } from './strategies.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError, NotFoundError } from '../../shared/errors/index.js'
import { FUNNEL_TYPES } from '@xgo/shared-types'

const FunnelTypeEnum = z.enum(
  Object.values(FUNNEL_TYPES) as [string, ...string[]],
)

const StrategyObjectiveEnum = z.enum(['LEAD', 'SALES', 'BRANDING'])

const CreateStrategySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  funnelType: FunnelTypeEnum,
  metricConfig: z.record(z.unknown()).default({}),
  projectId: z.string().uuid(),
  clientId: z.string().uuid(), // para assertClientAccess
  objective: StrategyObjectiveEnum.optional(),
  budget: z.number().positive().optional(),
}).strict()

const UpdateStrategySchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  funnelType: FunnelTypeEnum.optional(),
  clientId: z.string().uuid(),
  projectId: z.string().uuid(),
  objective: StrategyObjectiveEnum.nullable().optional(),
  budget: z.number().positive().nullable().optional(),
}).strict()

const MetricConfigSchema = z.object({
  metricConfig: z.record(z.unknown()),
})

const DashboardConfigSchema = z.object({
  dashboardConfig: z.record(z.unknown()),
})

const StrategyParamsSchema = z.object({ id: z.string().uuid() })

export async function strategiesRoutes(app: FastifyInstance) {
  const service = new StrategiesService(app.db)

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

  // GET /api/strategies?projectId=xxx&clientId=xxx
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = z.object({
      projectId: z.string().uuid(),
      clientId: z.string().uuid(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)
    const strategies = await service.list(query.projectId)
    return { data: strategies }
  })

  // GET /api/strategies/:id
  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const query = z.object({
      projectId: z.string().uuid(),
      clientId: z.string().uuid(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)
    const strategy = await service.findById(id, query.projectId)
    if (!strategy) throw new NotFoundError('Estratégia não encontrada')
    return { data: strategy }
  })

  // POST /api/strategies
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateStrategySchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const strategy = await service.create(
      {
        name: body.name,
        funnelType: body.funnelType as import('@xgo/shared-types').FunnelType,
        metricConfig: body.metricConfig,
        objective: body.objective as import('@prisma/client').StrategyObjective | undefined,
        budget: body.budget,
      },
      body.projectId,
      request.user.sub,
    )
    return reply.status(201).send({ data: strategy })
  })

  // PATCH /api/strategies/:id
  app.patch('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const body = UpdateStrategySchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const strategy = await service.update(
      id,
      {
        name: body.name,
        funnelType: body.funnelType as import('@xgo/shared-types').FunnelType | undefined,
        objective: body.objective as import('@prisma/client').StrategyObjective | null | undefined,
        budget: body.budget,
      },
      body.projectId,
      request.user.sub,
    )
    return { data: strategy }
  })

  // PATCH /api/strategies/:id/dashboard-config
  app.patch('/:id/dashboard-config', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const body = DashboardConfigSchema.parse(request.body)

    const strategy = await service.updateDashboardConfig(id, body.dashboardConfig, request.user.sub)
    return { data: strategy }
  })

  // PATCH /api/strategies/:id/metric-config
  app.patch('/:id/metric-config', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const body = MetricConfigSchema.parse(request.body)

    const strategy = await service.updateMetricConfig(id, body.metricConfig, request.user.sub)
    return { data: strategy }
  })

  // GET /api/strategies/:id/campaigns?clientId=
  app.get('/:id/campaigns', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const query = z.object({ clientId: z.string().uuid() }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const campaigns = await app.db.strategyCampaign.findMany({
      where: { strategyId: id },
      orderBy: { createdAt: 'asc' },
    })
    return { data: campaigns }
  })

  // DELETE /api/strategies/:id
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = StrategyParamsSchema.parse(request.params)
    const query = z.object({
      projectId: z.string().uuid(),
      clientId: z.string().uuid(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)
    await service.softDelete(id, query.projectId, request.user.sub)
    return reply.status(204).send()
  })
}
