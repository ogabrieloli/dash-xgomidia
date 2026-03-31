/**
 * Scheduler — cron jobs para sincronização automática de métricas.
 *
 * Usa BullMQ QueueScheduler + cron para enfileirar jobs periódicos.
 *
 * Crons:
 *  - Meta Ads sync: a cada 15 minutos
 *    → busca todas as AdAccounts META_ADS ativas
 *    → enfileira um MetaAdsSyncJob para cada uma
 *  - AI Insights (ALERT): a cada 1 hora
 *    → avalia Rules Engine para todos os clientes com contas sincronizadas
 *  - AI Insights LLM (SUMMARY + COMPARISON): semanalmente às segundas 7h
 *    → gera sumários e comparativos via Claude API
 */
import { Queue } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { format, subDays, getDay } from 'date-fns'
import { QUEUES, type MetaAdsSyncJob, type AiInsightsJob } from '@xgo/shared-types'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const db = new PrismaClient()

const redisConnection = { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' }
const metaQueue = new Queue<MetaAdsSyncJob>(QUEUES.META_ADS_SYNC, { connection: redisConnection })
const insightsQueue = new Queue<AiInsightsJob>(QUEUES.AI_INSIGHTS, { connection: redisConnection })

async function scheduleMetaAdsSync() {
  const today = new Date()
  const dateRange = {
    from: format(subDays(today, 30), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  }

  // Buscar todas as contas Meta Ads que não estão com status SYNCING
  const accounts = await db.adAccount.findMany({
    where: {
      platform: 'META_ADS',
      syncStatus: { not: 'SYNCING' },
    },
    select: { id: true, clientId: true },
  })

  log.info({ count: accounts.length }, 'Enfileirando sync Meta Ads')

  for (const account of accounts) {
    const payload: MetaAdsSyncJob = {
      adAccountId: account.id,
      clientId: account.clientId,
      dateRange,
      triggeredBy: 'scheduler',
    }

    await metaQueue.add('sync', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      // Deduplicar: só uma tentativa de sync por conta por vez
      jobId: `sync-${account.id}-${format(today, 'yyyyMMddHHmm')}`,
    })
  }

  log.info({ count: accounts.length }, 'Jobs de sync enfileirados')
}

async function scheduleAiInsights() {
  // Buscar todos os clientes ativos que têm contas sincronizadas
  const clients = await db.client.findMany({
    where: {
      deletedAt: null,
      adAccounts: { some: { syncStatus: 'SUCCESS' } },
    },
    select: { id: true },
  })

  for (const client of clients) {
    const payload: AiInsightsJob = {
      strategyId: '',
      clientId: client.id,
      insightType: 'ALERT',
      triggeredBy: 'scheduler',
    }

    await insightsQueue.add('evaluate-rules', payload, {
      jobId: `insights-${client.id}-${format(new Date(), 'yyyyMMdd')}`,
    })
  }

  log.info({ count: clients.length }, 'Jobs de insights enfileirados')
}

/**
 * Insights LLM semanais — checa a cada hora e executa na segunda-feira às 7h (hora local).
 * Gera SUMMARY e COMPARISON para cada cliente ativo com métricas sincronizadas.
 */
async function scheduleWeeklyLlmInsights() {
  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = getDay(now) // 0=domingo, 1=segunda, ...

  // Executar apenas nas segundas-feiras entre 7h e 8h
  if (dayOfWeek !== 1 || hour !== 7) return

  const clients = await db.client.findMany({
    where: {
      deletedAt: null,
      adAccounts: { some: { syncStatus: 'SUCCESS' } },
    },
    select: { id: true },
  })

  if (clients.length === 0) return

  log.info({ count: clients.length }, 'Enfileirando insights LLM semanais (segunda 7h)')

  const dateKey = format(now, 'yyyyMMdd')

  for (const client of clients) {
    // SUMMARY semanal
    await insightsQueue.add('llm-summary', {
      strategyId: '',
      clientId: client.id,
      insightType: 'SUMMARY',
      triggeredBy: 'scheduler',
    } as AiInsightsJob, {
      jobId: `llm-summary-${client.id}-${dateKey}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 120_000 },
    })

    // COMPARISON semanal
    await insightsQueue.add('llm-comparison', {
      strategyId: '',
      clientId: client.id,
      insightType: 'COMPARISON',
      triggeredBy: 'scheduler',
    } as AiInsightsJob, {
      jobId: `llm-comparison-${client.id}-${dateKey}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 120_000 },
    })
  }

  log.info({ count: clients.length * 2 }, 'Jobs LLM semanais enfileirados')
}

async function startCronLoop() {
  log.info('Scheduler iniciado — sync a cada 15 minutos, insights LLM semanais agendados (segunda 7h)')

  // Executar imediatamente na inicialização
  await scheduleMetaAdsSync().catch((err: Error) => {
    log.error({ err: err.message }, 'Erro no sync inicial')
  })

  // Loop de 15 minutos — sync de métricas
  const SYNC_INTERVAL_MS = 15 * 60 * 1000
  setInterval(async () => {
    await scheduleMetaAdsSync().catch((err: Error) => {
      log.error({ err: err.message }, 'Erro no sync periódico')
    })
  }, SYNC_INTERVAL_MS)

  // Loop de 1 hora — avaliação de regras (ALERT) + verificação de cron semanal LLM
  const HOURLY_INTERVAL_MS = 60 * 60 * 1000
  setInterval(async () => {
    await scheduleAiInsights().catch((err: Error) => {
      log.error({ err: err.message }, 'Erro no agendamento de insights')
    })

    // Verificar se é segunda às 7h para enfileirar insights LLM semanais
    await scheduleWeeklyLlmInsights().catch((err: Error) => {
      log.error({ err: err.message }, 'Erro no agendamento de insights LLM semanais')
    })
  }, HOURLY_INTERVAL_MS)
}

async function main() {
  log.info('Iniciando scheduler...')

  await startCronLoop()

  const shutdown = async () => {
    log.info('Encerrando scheduler...')
    await metaQueue.close()
    await insightsQueue.close()
    await db.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log.error({ err }, 'Erro fatal no scheduler')
  process.exit(1)
})
