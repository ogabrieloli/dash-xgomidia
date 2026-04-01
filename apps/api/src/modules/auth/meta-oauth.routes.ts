/**
 * Rotas de OAuth do Meta Ads.
 *
 * Fluxo:
 *  1. GET /auth/meta/connect?clientId=
 *     → retorna a URL do dialog OAuth do Meta (frontend faz o redirect)
 *
 *  2. GET /auth/meta/callback?code=&state=
 *     → troca o code por tokens
 *     → busca contas de anúncio disponíveis
 *     → armazena token no Vault (path temporário)
 *     → cria PendingMetaConnection no banco
 *     → redireciona para o front-end com ?meta_pending=<id>
 *
 *  3. GET /auth/meta/pending/:id
 *     → retorna a lista de contas disponíveis para seleção
 *
 *  4. POST /auth/meta/pending/:id/confirm
 *     → recebe selectedExternalIds
 *     → cria AdAccount para cada selecionada
 *     → limpa o pending e o token temporário do Vault
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ZodError } from 'zod'
import {
  storeAdAccountToken,
  buildVaultPath,
  getAdAccountToken,
  revokeAdAccountToken,
} from '../../plugins/vault.js'
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
  // Inicia o fluxo OAuth retornando a URL para o Meta
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
      scope: ['ads_read', 'ads_management'].join(','),
      response_type: 'code',
      state,
    })

    return reply.send({ url: `${META_OAUTH_URL}?${params.toString()}` })
  })

  // ─────────────────────────────────────────────
  // GET /auth/meta/callback?code=&state=
  // Callback do Meta — cria PendingMetaConnection e redireciona
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

    // 1. Trocar o code pelo access_token
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
      // Filtrar apenas contas ativas (status 1)
      adAccounts = (accountsData.data ?? []).filter((a) => a.account_status === 1)
    } catch (err) {
      app.log.error({ err }, 'Erro ao buscar ad accounts do Meta')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_accounts_fetch_failed`)
    }

    if (adAccounts.length === 0) {
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_no_active_accounts`)
    }

    // 3. Gerar ID único para o pending e armazenar token no Vault (path temporário)
    const pendingId = crypto.randomUUID()
    const tempVaultPath = buildVaultPath(clientId, 'META_ADS', `pending-${pendingId}`)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutos

    try {
      await storeAdAccountToken(app.vault, clientId, 'META_ADS', `pending-${pendingId}`, {
        accessToken: tokenData.access_token,
        expiresAt,
      })
    } catch (err) {
      app.log.error({ err }, 'Erro ao armazenar token temporário no Vault')
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_processing_failed`)
    }

    // 4. Salvar lista de contas no banco (sem criar AdAccount ainda)
    try {
      await app.db.pendingMetaConnection.create({
        data: {
          id: pendingId,
          clientId,
          userId,
          tempVaultPath,
          accounts: adAccounts as unknown as object[],
          expiresAt,
        },
      })
    } catch (err) {
      app.log.error({ err }, 'Erro ao criar PendingMetaConnection')
      // Limpar o vault path temporário
      await revokeAdAccountToken(app.vault, tempVaultPath).catch(() => null)
      return reply.redirect(`${frontEndUrl}/clients/${clientId}?error=meta_processing_failed`)
    }

    app.log.info({ clientId, pendingId, accountCount: adAccounts.length }, 'Meta OAuth pendente criado')

    return reply.redirect(`${frontEndUrl}/clients/${clientId}?meta_pending=${pendingId}`)
  })

  // ─────────────────────────────────────────────
  // GET /auth/meta/pending/:id
  // Retorna a lista de contas disponíveis para seleção
  // ─────────────────────────────────────────────
  app.get('/pending/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const pending = await app.db.pendingMetaConnection.findUnique({ where: { id } })

    if (!pending) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Solicitação não encontrada ou expirada' } })
    }

    if (pending.expiresAt < new Date()) {
      await app.db.pendingMetaConnection.delete({ where: { id } }).catch(() => null)
      return reply.status(410).send({ error: { code: 'EXPIRED', message: 'Solicitação expirada. Conecte novamente.' } })
    }

    return reply.send({
      data: {
        clientId: pending.clientId,
        accounts: pending.accounts,
      },
    })
  })

  // ─────────────────────────────────────────────
  // POST /auth/meta/pending/:id/confirm
  // Cria AdAccount para as contas selecionadas
  // ─────────────────────────────────────────────
  app.post('/pending/:id/confirm', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ConfirmBodySchema.parse(request.body)

    const pending = await app.db.pendingMetaConnection.findUnique({ where: { id } })

    if (!pending) {
      throw new AppError('Solicitação não encontrada ou expirada', 404, 'NOT_FOUND')
    }

    if (pending.expiresAt < new Date()) {
      await app.db.pendingMetaConnection.delete({ where: { id } }).catch(() => null)
      throw new AppError('Solicitação expirada. Conecte novamente.', 410, 'EXPIRED')
    }

    if (pending.userId !== request.user.sub) {
      throw new AppError('Acesso não autorizado', 403, 'FORBIDDEN')
    }

    // Ler token do path temporário do Vault
    let storedTokens: { access_token: string; expires_at: string }
    try {
      storedTokens = await getAdAccountToken(app.vault, pending.tempVaultPath) as { access_token: string; expires_at: string }
    } catch (err) {
      app.log.error({ err }, 'Erro ao ler token temporário do Vault')
      throw new AppError('Token temporário inválido ou expirado', 410, 'EXPIRED')
    }

    const accounts = pending.accounts as unknown as MetaAdAccount[]
    const selectedAccounts = accounts.filter((a) => body.selectedExternalIds.includes(a.id))

    const adAccountsService = new AdAccountsService(app.db)
    let connectedCount = 0

    for (const account of selectedAccounts) {
      const expiresAt = new Date(storedTokens.expires_at)

      try {
        // Armazenar token no Vault sob o path permanente da conta
        const vaultPath = await storeAdAccountToken(
          app.vault,
          pending.clientId,
          'META_ADS',
          account.id,
          { accessToken: storedTokens.access_token, expiresAt },
        )

        await adAccountsService.create(
          {
            platform: 'META_ADS',
            externalId: account.id,
            name: account.name,
            vaultSecretPath: vaultPath,
            currency: account.currency,
            timezone: account.timezone_name,
          },
          pending.clientId,
          pending.userId,
        )
        connectedCount++
      } catch (err) {
        app.log.warn({ err, externalId: account.id }, 'Conta já existe ou erro ao criar AdAccount')
      }
    }

    // Limpar pending e token temporário do Vault
    await Promise.all([
      app.db.pendingMetaConnection.delete({ where: { id } }).catch(() => null),
      revokeAdAccountToken(app.vault, pending.tempVaultPath).catch(() => null),
    ])

    app.log.info({ clientId: pending.clientId, connectedCount }, 'Meta Ads contas confirmadas')

    return reply.send({ data: { connectedCount } })
  })
}
