/**
 * Rotas de OAuth do Meta Ads.
 *
 * Fluxo:
 *  1. GET /auth/meta/connect?clientId=&userId=
 *     → redireciona para o dialog OAuth do Meta
 *
 *  2. GET /auth/meta/callback?code=&state=
 *     → troca o code por tokens
 *     → busca contas de anúncio disponíveis
 *     → armazena tokens no Vault (NUNCA no banco)
 *     → cria registro AdAccount com vaultSecretPath
 *     → redireciona para o front-end
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ZodError } from 'zod'
import { storeAdAccountToken, buildVaultPath } from '../../plugins/vault.js'
import { AdAccountsService } from '../ad-accounts/ad-accounts.service.js'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { AppError } from '../../shared/errors/index.js'

const META_API_VERSION = 'v19.0'
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
  const payload = JSON.stringify({ clientId, userId, nonce: crypto.randomUUID() })
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
  // Inicia o fluxo OAuth redirecionando para o Meta
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

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: [
        'ads_read',
        'ads_management',
        'business_management',
        'read_insights',
      ].join(','),
      response_type: 'code',
      state,
    })

    return reply.redirect(`${META_OAUTH_URL}?${params.toString()}`)
  })

  // ─────────────────────────────────────────────
  // GET /auth/meta/callback?code=&state=
  // Callback do Meta — troca code por tokens e cria AdAccounts
  // ─────────────────────────────────────────────
  app.get('/callback', async (request, reply) => {
    const query = CallbackQuerySchema.parse(request.query)
    const frontEndUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'

    // Erro de autorização vindo do Meta
    if (query.error || !query.code) {
      return reply.redirect(
        `${frontEndUrl}/clients?error=meta_oauth_denied`,
      )
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

    // 1. Trocar o code pelo access_token de longa duração
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: query.code,
    })

    let tokenData: MetaTokenResponse
    try {
      const tokenRes = await fetch(
        `${META_GRAPH_URL}/oauth/access_token?${tokenParams.toString()}`,
      )
      tokenData = await tokenRes.json() as MetaTokenResponse

      if (!tokenData.access_token) {
        throw new Error('Token não retornado pelo Meta')
      }
    } catch (err) {
      app.log.error({ err }, 'Erro ao trocar code por token Meta Ads')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_token_exchange_failed`)
    }

    // 2. Buscar contas de anúncio disponíveis
    let adAccounts: MetaAdAccount[]
    try {
      const accountsRes = await fetch(
        `${META_GRAPH_URL}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&access_token=${tokenData.access_token}`,
      )
      const accountsData = await accountsRes.json() as MetaAdAccountsResponse
      adAccounts = accountsData.data ?? []
    } catch (err) {
      app.log.error({ err }, 'Erro ao buscar ad accounts do Meta')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_accounts_fetch_failed`)
    }

    const adAccountsService = new AdAccountsService(app.db)
    let connectedCount = 0

    for (const account of adAccounts) {
      // Apenas contas ativas (account_status === 1)
      if (account.account_status !== 1) continue

      const externalId = account.id // ex: "act_123456789"
      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 3600 * 1000) // 60 dias de fallback

      // 3. Armazenar token no Vault — NUNCA no banco
      const vaultPath = await storeAdAccountToken(
        app.vault,
        clientId,
        'META_ADS',
        externalId,
        {
          accessToken: tokenData.access_token,
          expiresAt,
        },
      )

      // 4. Criar ou atualizar AdAccount no banco (apenas com o path do Vault)
      try {
        await adAccountsService.create(
          {
            platform: 'META_ADS',
            externalId,
            name: account.name,
            vaultSecretPath: vaultPath,
            currency: account.currency,
            timezone: account.timezone_name,
          },
          clientId,
          userId,
        )
        connectedCount++
      } catch {
        // Conta já conectada — ignorar conflito de unique constraint
      }
    }

    app.log.info({ clientId, connectedCount }, 'Meta Ads OAuth concluído')

    return reply.redirect(
      `${frontEndUrl}/clients/${clientId}?meta_connected=${connectedCount}`,
    )
  })
}
