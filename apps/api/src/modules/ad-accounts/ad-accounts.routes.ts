import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { ZodError } from 'zod'
import { format, subDays } from 'date-fns'
import { QUEUES, type MetaAdsSyncJob } from '@xgo/shared-types'
import { AdAccountsService } from './ad-accounts.service.js'
import {
  CreateAdAccountSchema,
  AdAccountIdParamSchema,
  AdAccountClientQuerySchema,
} from './ad-accounts.schema.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError, NotFoundError } from '../../shared/errors/index.js'

export async function adAccountsRoutes(app: FastifyInstance) {
  const service = new AdAccountsService(app.db)

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

  // GET /api/ad-accounts?clientId=
  app.get('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const query = AdAccountClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const accounts = await service.list(query.clientId)

    // Remover vaultSecretPath da resposta — dado sensível de infra
    return {
      data: accounts.map(({ vaultSecretPath: _vault, ...safe }) => safe),
    }
  })

  // POST /api/ad-accounts
  app.post('/', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = CreateAdAccountSchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    const account = await service.create(
      {
        platform: body.platform,
        externalId: body.externalId,
        name: body.name,
        vaultSecretPath: body.vaultSecretPath,
        currency: body.currency,
        timezone: body.timezone,
      },
      body.clientId,
      request.user.sub,
    )

    return reply.status(201).send({ data: account })
  })

  // DELETE /api/ad-accounts/:id?clientId=
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN')],
  }, async (request, reply) => {
    const { id } = AdAccountIdParamSchema.parse(request.params)
    const query = AdAccountClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    await service.delete(id, query.clientId, request.user.sub)
    return reply.status(204).send()
  })

  // POST /api/ad-accounts/:id/sync?clientId=
  app.post('/:id/sync', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = AdAccountIdParamSchema.parse(request.params)
    const query = AdAccountClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const account = await service.findById(id, query.clientId)
    if (!account) throw new NotFoundError('Conta de anúncio não encontrada')

    const today = new Date()
    const jobPayload: MetaAdsSyncJob = {
      adAccountId: id,
      clientId: query.clientId,
      dateRange: {
        from: format(subDays(today, 30), 'yyyy-MM-dd'),
        to: format(today, 'yyyy-MM-dd'),
      },
      triggeredBy: 'manual',
    }

    const queue = new Queue(QUEUES.META_ADS_SYNC, {
      connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
    })

    const job = await queue.add('sync', jobPayload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    })

    await queue.close()

    return reply.status(202).send({ data: { jobId: job.id } })
  })
}
