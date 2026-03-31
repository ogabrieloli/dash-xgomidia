import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { ClientsService } from './clients.service.js'
import {
  CreateClientSchema,
  UpdateClientSchema,
  ListClientsQuerySchema,
  ClientIdParamSchema,
} from './clients.schema.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError, NotFoundError } from '../../shared/errors/index.js'

export async function clientsRoutes(app: FastifyInstance) {
  const service = new ClientsService(app.db)

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

  // GET /api/clients
  app.get('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const query = ListClientsQuerySchema.parse(request.query)
    const clients = await service.list(request.user.agencyId, query)
    return { data: clients }
  })

  // GET /api/clients/:id
  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = ClientIdParamSchema.parse(request.params)
    await assertClientAccess(request.user.sub, request.user.role, id, app.db)

    const client = await service.findById(id, request.user.agencyId)
    if (!client) throw new NotFoundError('Cliente não encontrado')

    return { data: client }
  })

  // POST /api/clients
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateClientSchema.parse(request.body)
    const client = await service.create(body, request.user.agencyId, request.user.sub)
    return reply.status(201).send({ data: client })
  })

  // PATCH /api/clients/:id
  app.patch('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = ClientIdParamSchema.parse(request.params)
    await assertClientAccess(request.user.sub, request.user.role, id, app.db)

    const body = UpdateClientSchema.parse(request.body)
    const client = await service.update(id, body, request.user.agencyId, request.user.sub)
    return { data: client }
  })

  // DELETE /api/clients/:id
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN')],
  }, async (request, reply) => {
    const { id } = ClientIdParamSchema.parse(request.params)
    await service.softDelete(id, request.user.agencyId, request.user.sub)
    return reply.status(204).send()
  })
}
