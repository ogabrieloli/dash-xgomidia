/**
 * Worker BullMQ para geração de insights via Rules Engine.
 *
 * Fluxo por job:
 *  1. Buscar métricas dos últimos 7 dias para cada AdAccount do cliente
 *  2. Calcular médias de ROAS, CPA, CTR, CPM
 *  3. Avaliar as 4 regras
 *  4. Para cada regra disparada: criar AiInsight + TimelineEntry ALERT
 *  5. Deduplicação: ignorar insights já criados nas últimas 24h
 */
import { Worker, type Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { format, subDays } from 'date-fns'
import { QUEUES, type AiInsightsJob } from '@xgo/shared-types'
import { calculateDerivedMetrics } from '@xgo/metrics-schema'
import { evaluateRules, type RuleThresholds } from './rules/index.js'
import { processLlmInsightJob } from './llm/worker.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const db = new PrismaClient()

// ID do usuário sistema — criado no seed para entradas automáticas de timeline
const SYSTEM_USER_ID = process.env['SYSTEM_USER_ID'] ?? ''

async function processInsightsJob(job: Job<AiInsightsJob>): Promise<void> {
  const { strategyId, clientId, insightType } = job.data

  // Delegar para o worker LLM quando não for ALERT
  if (insightType !== 'ALERT') {
    return processLlmInsightJob(job)
  }

  log.info({ jobId: job.id, clientId, strategyId }, 'Processando insights')

  // 1. Buscar AdAccounts do cliente
  const accounts = await db.adAccount.findMany({
    where: { clientId, syncStatus: 'SUCCESS' },
    select: { id: true, externalId: true },
  })

  if (accounts.length === 0) {
    log.info({ clientId }, 'Nenhuma conta sincronizada — pulando avaliação')
    return
  }

  // 2. Buscar metricConfig da estratégia (para thresholds customizados)
  let thresholds: RuleThresholds = {}
  if (strategyId) {
    const strategy = await db.strategy.findUnique({
      where: { id: strategyId },
      select: { metricConfig: true },
    })
    if (strategy?.metricConfig) {
      const config = strategy.metricConfig as Record<string, unknown>
      const t: RuleThresholds = {}
      if (typeof config['minRoas'] === 'number') t.minRoas = config['minRoas']
      if (typeof config['maxCpa'] === 'number') t.maxCpa = config['maxCpa']
      if (typeof config['minCtr'] === 'number') t.minCtr = config['minCtr']
      if (typeof config['maxCpm'] === 'number') t.maxCpm = config['maxCpm']
      thresholds = t
    }
  }

  // 3. Para cada conta, calcular médias dos últimos 7 dias
  const today = new Date()
  const from = new Date(format(subDays(today, 7), 'yyyy-MM-dd'))
  const to = today

  for (const account of accounts) {
    const snapshots = await db.metricSnapshot.findMany({
      where: {
        adAccountId: account.id,
        date: { gte: from, lte: to },
      },
    })

    if (snapshots.length === 0) continue

    // Calcular totais
    const totImp = snapshots.reduce((s: number, r: any) => s + Number(r.impressions), 0)
    const totClicks = snapshots.reduce((s: number, r: any) => s + Number(r.clicks), 0)
    const totSpend = snapshots.reduce((s: number, r: any) => s + Number(r.spend), 0)
    const totConv = snapshots.reduce((s: number, r: any) => s + r.conversions, 0)
    const totRev = snapshots.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0)

    const derived = calculateDerivedMetrics({
      date: '',
      platform: 'META_ADS',
      externalAccountId: account.id,
      impressions: totImp,
      clicks: totClicks,
      spend: totSpend,
      conversions: totConv,
      revenue: totRev,
      rawData: null,
    })

    // 4. Avaliar regras
    const fired = evaluateRules({
      adAccountId: account.id,
      clientId,
      strategyId: strategyId ?? undefined,
      periodDays: 7,
      avgRoas: derived.roas,
      avgCpa: derived.cpa,
      avgCtr: derived.ctr,
      avgCpm: derived.cpm,
      totalSpend: totSpend,
      thresholds,
    })

    // 5. Persistir insights + timeline entries
    for (const rule of fired) {
      const ruleKey = rule.title.split(':')[0]?.toLowerCase().replace(/\s+/g, '_') ?? 'unknown'

      // Deduplica: ignora se já existe insight do mesmo ruleKey nas últimas 24h
      const recentCount = await db.aiInsight.count({
        where: {
          clientId,
          source: 'RULES_ENGINE',
          createdAt: { gte: subDays(new Date(), 1) },
          title: { startsWith: rule.title.split(':')[0] ?? '' },
        },
      })

      if (recentCount > 0) {
        log.debug({ ruleKey, clientId }, 'Insight duplicado — ignorado')
        continue
      }

      await db.aiInsight.create({
        data: {
          clientId,
          strategyId: strategyId ?? null,
          type: 'ALERT',
          severity: rule.severity,
          title: rule.title,
          body: rule.body,
          source: 'RULES_ENGINE',
          metadata: { adAccountId: account.id, ruleKey } as object,
        },
      })

      // Criar entrada de timeline ALERT (se tivermos um usuário sistema)
      if (SYSTEM_USER_ID) {
        await db.timelineEntry.create({
          data: {
            clientId,
            authorId: SYSTEM_USER_ID,
            type: 'ALERT',
            title: rule.title,
            body: rule.body,
            occurredAt: new Date(),
          },
        }).catch((err: Error) => {
          log.warn({ err: err.message }, 'Erro ao criar TimelineEntry de alerta')
        })
      }

      log.info({ clientId, ruleKey, severity: rule.severity }, 'Insight criado')
    }
  }
}

export function createWorker() {
  const worker = new Worker<AiInsightsJob>(
    QUEUES.AI_INSIGHTS,
    processInsightsJob,
    {
      connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
      concurrency: 5,
    },
  )

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job AI insights concluído')
  })

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Job AI insights falhou')
  })

  return worker
}
