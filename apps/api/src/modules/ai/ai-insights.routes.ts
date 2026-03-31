import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { AiInsightsService } from './ai-insights.service.js'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError } from '../../shared/errors/index.js'

const ClientQuerySchema = z.object({
  clientId: z.string().uuid(),
  onlyUnread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
})

const InsightParamsSchema = z.object({ id: z.string().uuid() })

export async function aiInsightsRoutes(app: FastifyInstance) {
  const service = new AiInsightsService(app.db)

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

  // GET /api/insights?clientId=&onlyUnread=true&severity=CRITICAL
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = ClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const insights = await service.list(query.clientId, {
      onlyUnread: query.onlyUnread,
      severity: query.severity,
    })

    return { data: insights }
  })

  // PATCH /api/insights/:id/read?clientId=
  app.patch('/:id/read', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = InsightParamsSchema.parse(request.params)
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    const insight = await service.markAsRead(id, clientId)
    return { data: insight }
  })

  // POST /api/insights/read-all?clientId=
  app.post('/read-all', {
    preHandler: [authenticate],
  }, async (request) => {
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    await service.markAllAsRead(clientId)
    return { data: { message: 'Todos os insights marcados como lidos' } }
  })
}
