import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { TimelineService } from './timeline.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError } from '../../shared/errors/index.js'

const ENTRY_TYPES = ['ACTION', 'MEETING', 'OPTIMIZATION', 'NOTE', 'ALERT'] as const

const CreateEntrySchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(ENTRY_TYPES),
  title: z.string().min(2).max(200).trim(),
  body: z.string().max(2000).default(''),
  occurredAt: z.string().datetime().optional().transform((v) =>
    v ? new Date(v) : new Date()
  ),
})

const ClientQuerySchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(ENTRY_TYPES).optional(),
})

const EntryParamsSchema = z.object({ id: z.string().uuid() })

export async function timelineRoutes(app: FastifyInstance) {
  const service = new TimelineService(app.db)

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

  // GET /api/timeline?clientId=&type=
  app.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const query = ClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const entries = await service.list(query.clientId, { type: query.type })
    return { data: entries }
  })

  // POST /api/timeline
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateEntrySchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const entry = await service.create(
      {
        type: body.type,
        title: body.title,
        body: body.body,
        occurredAt: body.occurredAt,
      },
      body.clientId,
      request.user.sub,
    )

    return reply.status(201).send({ data: entry })
  })

  // DELETE /api/timeline/:id?clientId=
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = EntryParamsSchema.parse(request.params)
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)

    await service.delete(id, clientId, request.user.sub)
    return reply.status(204).send()
  })
}
