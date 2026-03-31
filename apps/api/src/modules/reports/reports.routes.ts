import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { Queue } from 'bullmq'
import { ReportsService } from './reports.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError } from '../../shared/errors/index.js'
import { getSignedDownloadUrl } from '../../shared/utils/storage.js'
import { QUEUES, type ReportRenderJob } from '@xgo/shared-types'

const REPORT_TYPES = ['PDF', 'PPT', 'WEB'] as const

const CreateReportSchema = z.object({
  clientId: z.string().uuid(),
  strategyId: z.string().uuid().optional(),
  title: z.string().min(2).max(200).trim(),
  type: z.enum(REPORT_TYPES),
  config: z.record(z.unknown()).default({}),
})

const ReportParamsSchema = z.object({ id: z.string().uuid() })
const ClientQuerySchema = z.object({ clientId: z.string().uuid() })

function makeRenderQueue() {
  return new Queue<ReportRenderJob>(QUEUES.REPORT_RENDER, {
    connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
  })
}

export async function reportsRoutes(app: FastifyInstance) {
  const renderQueue = makeRenderQueue()
  const service = new ReportsService(app.db, renderQueue)

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

  // GET /api/reports?clientId=
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const { clientId } = ClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    const reports = await service.list(clientId)
    return { data: reports }
  })

  // POST /api/reports
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateReportSchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const report = await service.create({
      clientId: body.clientId,
      strategyId: body.strategyId,
      title: body.title,
      type: body.type,
      config: body.config,
    })

    return reply.status(201).send({ data: report })
  })

  // POST /api/reports/:id/share?clientId= — gera shareToken com TTL 72h
  app.post('/:id/share', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = ReportParamsSchema.parse(request.params)
    const { clientId } = ClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    const result = await service.createShareLink(id, clientId)
    const shareUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/r/${result.token}`

    return reply.status(201).send({
      data: { token: result.token, shareUrl, expiresAt: result.expiresAt },
    })
  })

  // GET /api/reports/:id/download?clientId=
  // Gera URL pré-assinada (TTL 1h) para download do relatório
  app.get('/:id/download', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = ReportParamsSchema.parse(request.params)
    const { clientId } = ClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    const report = await service.findById(id, clientId)

    if (report.status !== 'DONE' || !report.storageKey) {
      throw new AppError('Relatório ainda não está disponível para download', 409, 'REPORT_NOT_READY')
    }

    const url = await getSignedDownloadUrl(report.storageKey, 3600)
    return { data: { url, expiresIn: 3600 } }
  })
}
