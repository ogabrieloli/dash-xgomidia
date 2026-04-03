/**
 * Rotas de OAuth do Meta Ads.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'
import {
  storeAdAccountToken,
  getAdAccountToken,
  revokeAdAccountToken,
} from '../../plugins/vault.js'
import { AdAccountsService } from '../ad-accounts/ad-accounts.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { AppError } from '../../shared/errors/index.js'
import { Queue } from 'bullmq'
import { QUEUES, type MetaAdsSyncJob } from '@xgo/shared-types'
import { format, subDays } from 'date-fns'

const META_API_VERSION = 'v25.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`
const META_OAUTH_URL = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`

const ConnectQuerySchema = z.object({
  clientId: z.string().uuid('clientId deve ser um UUID válido'),
})

const CallbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string(),
})

const ConfirmBodySchema = z.object({
  selectedExternalIds: z.array(z.string()).min(1, 'Selecione ao menos uma conta'),
})

interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface MetaAdAccount {
  id: string
  name: string
  currency: string
  timezone_name: string
  account_status: number
}

interface MetaAdAccountsResponse {
  data: MetaAdAccount[]
}

function encodeState(clientId: string, userId: string): string {
  const payload = JSON.stringify({ clientId, userId, nonce: randomUUID() })
  return Buffer.from(payload).toString('base64url')
}

function decodeState(state: string): { clientId: string; userId: string } {
  const payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as {
    clientId: string
    userId: string
  }
  return { clientId: payload.clientId, userId: payload.userId }
}

export async function metaOAuthRoutes(app: FastifyInstance) {
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

  // ─────────────────────────────────────────────
  // GET /auth/meta/connect?clientId=
  // ─────────────────────────────────────────────
  app.get('/connect', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const query = ConnectQuerySchema.parse(request.query)
    const appId = process.env['META_APP_ID']
    const redirectUri = process.env['META_REDIRECT_URI']

    if (!appId || !redirectUri) {
      throw new AppError('Meta Ads não está configurado neste ambiente', 503, 'SERVICE_UNAVAILABLE')
    }

    const state = encodeState(query.clientId, request.user.sub)
    const scope = 'ads_read,ads_management,business_management'
    const url = `${META_OAUTH_URL}?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`

    return reply.send({ url })
  })

  // ─────────────────────────────────────────────
  // GET /auth/meta/callback?code=&state=
  // ─────────────────────────────────────────────
  app.get('/callback', async (request, reply) => {
    const query = CallbackQuerySchema.parse(request.query)
    const frontEndUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'

    if (query.error || !query.code) {
      return reply.redirect(`${frontEndUrl}/clients?error=meta_oauth_denied`)
    }

    const appId = process.env['META_APP_ID']
    const appSecret = process.env['META_APP_SECRET']
    const redirectUri = process.env['META_REDIRECT_URI']

    if (!appId || !appSecret || !redirectUri) {
      return reply.redirect(`${frontEndUrl}/clients?error=meta_not_configured`)
    }

    let clientId: string
    let userId: string

    try {
      const decoded = decodeState(query.state)
      clientId = decoded.clientId
      userId = decoded.userId
    } catch {
      return reply.redirect(`${frontEndUrl}/clients?error=invalid_state`)
    }

    // 1. Trocar code por token de curta duração
    let tokenData: MetaTokenResponse
    try {
      const tokenUrl = `${META_GRAPH_URL}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(query.code!)}`
      const tokenRes = await fetch(tokenUrl)
      tokenData = await tokenRes.json() as MetaTokenResponse
      if (!tokenData.access_token) throw new Error('Token não retornado')
    } catch (err) {
      app.log.error({ err }, 'Erro no token exchange do Meta')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}/platforms/meta?error=meta_token_failed`)
    }

    // 1b. Trocar por long-lived token (válido por 60 dias)
    try {
      const exchangeParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: tokenData.access_token,
      })
      const exchangeRes = await fetch(`${META_GRAPH_URL}/oauth/access_token?${exchangeParams.toString()}`)
      if (exchangeRes.ok) {
        const longLived = await exchangeRes.json() as MetaTokenResponse
        if (longLived.access_token) {
          app.log.info({ clientId }, 'Long-lived token obtido com sucesso')
          tokenData = longLived
        }
      }
    } catch (err) {
      // Não bloqueia o fluxo — usa o token original como fallback
      app.log.warn({ err }, 'Falha ao obter long-lived token — usando token original')
    }

    // 2. Buscar TODAS as contas de anúncio disponíveis (com paginação)
    let adAccounts: MetaAdAccount[] = []
    try {
      let nextUrl: string | null = `${META_GRAPH_URL}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=100&access_token=${tokenData.access_token}`

      while (nextUrl) {
        const accountsRes = await fetch(nextUrl)
        if (!accountsRes.ok) throw new Error(`Meta API error: ${accountsRes.status}`)

        const accountsData = await accountsRes.json() as any
        const pageAccounts = (accountsData.data ?? []) as MetaAdAccount[]

        // Apenas contas ativas
        adAccounts.push(...pageAccounts.filter(acc => acc.account_status === 1))

        // Se houver próxima página, continua o loop
        nextUrl = accountsData.paging?.next || null

        // Prevenção contra loop infinito (limite de 5000 contas)
        if (adAccounts.length > 5000) break
      }
    } catch (err) {
      app.log.error({ err }, 'Erro ao buscar contas do Meta')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}/platforms/meta?error=meta_fetch_failed`)
    }

    // 3. Criar Pending
    try {
      const pendingId = randomUUID()
      const tempVaultPath = `secret/data/temp/meta/${pendingId}`

      await (app.db as any).pendingMetaConnection.create({
        data: {
          id: pendingId,
          clientId,
          userId,
          accounts: adAccounts as any,
          tempVaultPath,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      })

      await app.vault.write(tempVaultPath, {
        data: {
          accessToken: tokenData.access_token,
          expiresAt: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
        }
      })

      return reply.redirect(`${frontEndUrl}/clients/${clientId}?meta_pending=${pendingId}`)
    } catch (err) {
      app.log.error({ err }, 'Erro ao salvar conexão pendente')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}/platforms/meta?error=meta_save_failed`)
    }
  })

  // ─────────────────────────────────────────────
  // GET /auth/meta/pending/:id
  // ─────────────────────────────────────────────
  app.get('/pending/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const pending = await (app.db as any).pendingMetaConnection.findUnique({ where: { id } })

    if (!pending || pending.expiresAt < new Date()) {
      throw new AppError('Solicitação expirada ou não encontrada', 404, 'NOT_FOUND')
    }

    return { data: { clientId: pending.clientId, accounts: pending.accounts } }
  })

  // ─────────────────────────────────────────────
  // POST /auth/meta/pending/:id/confirm
  // ─────────────────────────────────────────────
  app.post('/pending/:id/confirm', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ConfirmBodySchema.parse(request.body)
    const pending = await (app.db as any).pendingMetaConnection.findUnique({ where: { id } })

    if (!pending || pending.expiresAt < new Date()) {
      throw new AppError('Solicitação expirada', 410, 'EXPIRED')
    }

    const vaultRes = await app.vault.read(pending.tempVaultPath)
    const tokenData = vaultRes.data.data as { accessToken: string; expiresAt: string }
    const allAccounts = pending.accounts as MetaAdAccount[]
    const selectedAccounts = allAccounts.filter(a => body.selectedExternalIds.includes(a.id))

    const adAccountsService = new AdAccountsService(app.db)
    let connectedCount = 0

    for (const acc of selectedAccounts) {
      const vaultPath = await storeAdAccountToken(app.vault, pending.clientId, 'META_ADS', acc.id, {
        accessToken: tokenData.accessToken,
        expiresAt: new Date(tokenData.expiresAt),
      })

      const account = await adAccountsService.create({
        platform: 'META_ADS',
        externalId: acc.id,
        name: acc.name,
        vaultSecretPath: vaultPath,
        currency: acc.currency,
        timezone: acc.timezone_name,
      }, pending.clientId, pending.userId).catch(() => null)

      if (account) {
        connectedCount++

        // Enfileirar sync inicial (30 dias)
        const queue = new Queue(QUEUES.META_ADS_SYNC, {
          connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
        })

        const today = new Date()
        await queue.add('sync', {
          adAccountId: account.id,
          clientId: pending.clientId,
          dateRange: {
            from: format(subDays(today, 30), 'yyyy-MM-dd'),
            to: format(today, 'yyyy-MM-dd'),
          },
          triggeredBy: 'initial_sync',
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 }
        }).catch(err => app.log.error({ err, adAccountId: account.id }, 'Erro ao enfileirar sync inicial'))

        await queue.close()
      }
    }

    await (app.db as any).pendingMetaConnection.delete({ where: { id } }).catch(() => null)
    await revokeAdAccountToken(app.vault, pending.tempVaultPath).catch(() => null)

    return { data: { connectedCount } }
  })
}
