/**
 * Worker BullMQ para sync de métricas do Meta Ads.
 *
 * Cada job:
 *  1. Busca a AdAccount no banco
 *  2. Lê o access token do Vault
 *  3. Valida o token — renova se necessário
 *  4. Busca métricas via MetaAdapter
 *  5. Persiste MetricSnapshots no banco (upsert)
 *  6. Atualiza syncStatus e lastSyncAt na AdAccount
 *
 * Retry: exponential backoff (1min, 2min, 5min) — até 3 tentativas
 * Dead Letter: após 3 falhas, sincStatus = ERROR + syncError gravado
 */
import { Worker, type Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import type { MetaAdsSyncJob } from '@xgo/shared-types'
import { QUEUES } from '@xgo/shared-types'
import { MetaAdapter } from './meta-adapter.js'
import { getAdAccountToken, storeAdAccountToken } from './vault.js'
import { Redis } from 'ioredis'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const db = new PrismaClient()

const metaAdapter = new MetaAdapter(
  process.env['META_APP_ID'] ?? '',
  process.env['META_APP_SECRET'] ?? '',
)

export async function processMetaAdsSyncJob(job: Job<MetaAdsSyncJob>): Promise<void> {
  const { adAccountId, clientId, dateRange } = job.data

  log.info({ jobId: job.id, adAccountId, clientId }, 'Iniciando sync Meta Ads')

  try {
    // 1. Buscar AdAccount no banco
    const adAccount = await db.adAccount.findFirst({
      where: { id: adAccountId, clientId },
    })

    if (!adAccount) {
      log.error({ adAccountId }, 'AdAccount não encontrada no banco')
      return // Se não existe, não adianta tentar de novo
    }

    // 2. Atualizar status para SYNCING
    await db.adAccount.update({
      where: { id: adAccountId },
      data: { syncStatus: 'SYNCING' },
    })

    // 3. Ler tokens do Vault
    const vault = await createVaultClient()
    const tokens = await getAdAccountToken(vault, adAccount.vaultSecretPath)

    if (!tokens?.access_token) {
      throw new Error('Token de acesso não encontrado no Vault')
    }

    let accessToken = tokens.access_token

    // 4. Validar token — renovar se necessário
    const expiresAt = new Date(tokens.expires_at)
    const isExpiredOrExpiring = expiresAt <= new Date(Date.now() + 5 * 60 * 1000) // 5min buffer

    if (isExpiredOrExpiring) {
      log.info({ adAccountId }, 'Token expirado — renovando via Meta API')

      // Usar o token atual como refresh token (Meta long-lived token exchange)
      const refreshed = await metaAdapter.refreshToken(accessToken)
      accessToken = refreshed.accessToken

      // Atualizar token no Vault
      await storeAdAccountToken(vault, clientId, 'META_ADS', adAccount.externalId, {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      })

      log.info({ adAccountId }, 'Token renovado com sucesso')
    }

    // 5. Buscar métricas por campanha
    log.info({ adAccountId, dateRange }, 'Buscando métricas do Meta Ads (level=campaign)')
    const metrics = await metaAdapter.fetchMetrics(adAccount.externalId, accessToken, dateRange, 'campaign')
    log.info({ adAccountId, count: metrics.length }, 'Métricas recebidas')

    // 6. Persistir MetricSnapshots (upsert por campanha por dia)
    let upsertCount = 0
    for (const metric of metrics) {
      const externalCampaignId = metric.externalCampaignId ?? null
      await db.metricSnapshot.upsert({
        where: {
          adAccountId_date_platform_externalCampaignId: {
            adAccountId,
            date: new Date(metric.date),
            platform: 'META_ADS',
            externalCampaignId: externalCampaignId ?? '',
          },
        },
        create: {
          adAccountId,
          date: new Date(metric.date),
          platform: 'META_ADS',
          impressions: BigInt(metric.impressions),
          clicks: BigInt(metric.clicks),
          spend: metric.spend,
          conversions: metric.conversions,
          revenue: metric.revenue ?? null,
          reach: metric.reach ?? null,
          videoViews: metric.videoViews ?? null,
          rawData: metric.rawData as object,
          externalCampaignId,
          campaignName: metric.campaignName ?? null,
        },
        update: {
          impressions: BigInt(metric.impressions),
          clicks: BigInt(metric.clicks),
          spend: metric.spend,
          conversions: metric.conversions,
          revenue: metric.revenue ?? null,
          reach: metric.reach ?? null,
          videoViews: metric.videoViews ?? null,
          rawData: metric.rawData as object,
          campaignName: metric.campaignName ?? null,
        },
      })
      upsertCount++
    }

    // 7. Marcar sync como concluído
    await db.adAccount.update({
      where: { id: adAccountId },
      data: {
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date(),
        syncError: null,
      },
    })

    log.info({ adAccountId, upsertCount }, 'Sync Meta Ads concluído com sucesso')
  } catch (err) {
    const error = err as Error
    log.error({ adAccountId, error: error.message }, 'Erro durante processamento do job')

    // Se for o primeiro erro e quisermos que a UI mostre erro logo, ou se preferir deixar o BullMQ tentar
    // Vamos deixar o BullMQ tentar, mas o worker.on('failed') cuidará do status se esgotar.
    // Porém, se o erro for de Vault ou Token, talvez não faça sentido tentar 3 vezes rápido.
    throw err
  }
}

async function createVaultClient() {
  const nodeVault = await import('node-vault')
  return nodeVault.default({
    apiVersion: 'v1',
    endpoint: process.env['VAULT_ADDR'] ?? 'http://localhost:8200',
    token: process.env['VAULT_TOKEN'] ?? 'root',
  }) as Parameters<typeof getAdAccountToken>[0]
}

export function createWorker() {
  const worker = new Worker<MetaAdsSyncJob>(
    QUEUES.META_ADS_SYNC,
    processMetaAdsSyncJob,
    {
      connection: new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }),
      concurrency: 3,
    },
  )

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job Meta Ads sync concluído')
  })

  worker.on('failed', async (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Job Meta Ads sync falhou')

    // Se atingiu o limite de tentativas — gravar erro no banco
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const adAccountId = job.data.adAccountId
      await db.adAccount.update({
        where: { id: adAccountId },
        data: {
          syncStatus: 'ERROR',
          syncError: err.message.slice(0, 500),
        },
      }).catch((dbErr: Error) => {
        log.error({ dbErr: dbErr.message, adAccountId }, 'Erro ao gravar syncError no banco')
      })
    }
  })

  return worker
}
