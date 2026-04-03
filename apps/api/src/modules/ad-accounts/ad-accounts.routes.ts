import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { z, ZodError } from 'zod'
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
import { getAdAccountToken } from '../../plugins/vault.js'

const META_API_VERSION = 'v25.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaCampaign {
  id: string
  name: string
  status: string
  objective?: string
}

async function fetchMetaCampaigns(externalId: string, accessToken: string): Promise<MetaCampaign[]> {
  const params = new URLSearchParams({
    fields: 'id,name,status,objective',
    access_token: accessToken,
    limit: '500',
  })

  const res = await fetch(`${META_GRAPH_URL}/${externalId}/campaigns?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta API error ${res.status}: ${body}`)
  }

  const body = await res.json() as { data: MetaCampaign[] }
  return body.data
}

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

  // GET /api/ad-accounts/:id/campaigns?clientId=
  app.get('/:id/campaigns', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request) => {
    const { id } = AdAccountIdParamSchema.parse(request.params)
    const query = AdAccountClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const account = await service.findById(id, query.clientId)
    if (!account) throw new NotFoundError('Conta de anúncio não encontrada')

    const tokens = await getAdAccountToken(app.vault, account.vaultSecretPath)
    const campaigns = await fetchMetaCampaigns(account.externalId, tokens.access_token)

    return { data: campaigns }
  })

  // POST /api/ad-accounts/:id/strategy-campaigns?clientId=
  // Vincula campanhas a uma estratégia
  app.post('/:id/strategy-campaigns', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = AdAccountIdParamSchema.parse(request.params)
    const query = AdAccountClientQuerySchema.parse(request.query)
    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    const body = z.object({
      strategyId: z.string().uuid(),
      campaigns: z.array(z.object({
        externalId: z.string(),
        name: z.string(),
      })).min(1),
    }).parse(request.body)

    // Upsert cada campanha
    const created = await Promise.all(
      body.campaigns.map((c) =>
        app.db.strategyCampaign.upsert({
          where: { strategyId_externalId: { strategyId: body.strategyId, externalId: c.externalId } },
          create: {
            strategyId: body.strategyId,
            adAccountId: id,
            externalId: c.externalId,
            name: c.name,
          },
          update: { name: c.name },
        }),
      ),
    )

    return reply.status(201).send({ data: created })
  })

  // DELETE /api/ad-accounts/:id/strategy-campaigns/:externalId?clientId=&strategyId=
  app.delete('/:id/strategy-campaigns/:externalId', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id: _adAccountId } = AdAccountIdParamSchema.parse(request.params)
    const { externalId } = z.object({ externalId: z.string() }).parse(request.params)
    const query = z.object({
      clientId: z.string().uuid(),
      strategyId: z.string().uuid(),
    }).parse(request.query)

    await assertClientAccess(request.user.sub, request.user.role, query.clientId, app.db)

    await app.db.strategyCampaign.deleteMany({
      where: { strategyId: query.strategyId, externalId },
    })

    return reply.status(204).send()
  })
}
