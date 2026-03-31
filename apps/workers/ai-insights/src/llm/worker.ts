/**
 * Worker BullMQ para geração de insights via Claude LLM.
 *
 * Fluxo por job:
 *  1. Buscar métricas dos últimos N dias para o cliente/estratégia
 *  2. Para COMPARISON: buscar também métricas do período anterior
 *  3. Verificar cache de 24h (deduplicação por tipo/estratégia/dia)
 *  4. Chamar Claude API
 *  5. Persistir AiInsight com metadata de tokens consumidos
 */
import type { Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { format, subDays } from 'date-fns'
import type { AiInsightsJob } from '@xgo/shared-types'
import { calculateDerivedMetrics } from '@xgo/metrics-schema'
import { generateLlmInsight } from './claude-engine.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const db = new PrismaClient()

export async function processLlmInsightJob(job: Job<AiInsightsJob>): Promise<void> {
  const { strategyId, clientId, insightType } = job.data

  if (insightType === 'ALERT') return // ALERT é tratado pelo rules engine worker

  log.info({ jobId: job.id, clientId, strategyId, insightType }, 'Processando insight LLM')

  // Verificar cache 24h
  const today = format(new Date(), 'yyyy-MM-dd')
  const cacheKey = `${insightType}:${strategyId || clientId}:${today}`

  const existing = await db.aiInsight.count({
    where: {
      clientId,
      strategyId: strategyId || null,
      type: insightType,
      source: 'LLM',
      createdAt: { gte: subDays(new Date(), 1) },
    },
  })

  if (existing > 0) {
    log.info({ cacheKey }, 'Insight LLM já existe para hoje — ignorado')
    return
  }

  // Buscar dados do cliente e estratégia
  const [clientData, strategyData] = await Promise.all([
    db.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    }),
    strategyId
      ? db.strategy.findUnique({
          where: { id: strategyId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ])

  if (!clientData) {
    log.warn({ clientId }, 'Cliente não encontrado')
    return
  }

  // Buscar métricas dos últimos 30 dias
  const periodDays = 30
  const today_ = new Date()
  const from = subDays(today_, periodDays)

  const accounts = await db.adAccount.findMany({
    where: { clientId, syncStatus: 'SUCCESS' },
    select: { id: true },
  })

  if (accounts.length === 0) {
    log.info({ clientId }, 'Nenhuma conta sincronizada — pulando insight LLM')
    return
  }

  // Agregar snapshots de todas as contas
  const snapshots = await db.metricSnapshot.findMany({
    where: {
      adAccountId: { in: accounts.map((a) => a.id) },
      date: { gte: from, lte: today_ },
    },
  })

  if (snapshots.length === 0) {
    log.info({ clientId }, 'Sem snapshots — pulando insight LLM')
    return
  }

  const totImp = snapshots.reduce((s, r) => s + Number(r.impressions), 0)
  const totClicks = snapshots.reduce((s, r) => s + Number(r.clicks), 0)
  const totSpend = snapshots.reduce((s, r) => s + Number(r.spend), 0)
  const totConv = snapshots.reduce((s, r) => s + r.conversions, 0)
  const totRev = snapshots.reduce((s, r) => s + Number(r.revenue ?? 0), 0)

  const derived = calculateDerivedMetrics({
    date: '',
    platform: 'META_ADS',
    externalAccountId: accounts[0]?.id ?? '',
    impressions: totImp,
    clicks: totClicks,
    spend: totSpend,
    conversions: totConv,
    revenue: totRev,
    rawData: null,
  })

  // Para COMPARISON: buscar período anterior
  let previousData: { totalSpend: number; roas: number; cpa: number; ctr: number } | undefined

  if (insightType === 'COMPARISON') {
    const prevFrom = subDays(from, periodDays)
    const prevSnapshots = await db.metricSnapshot.findMany({
      where: {
        adAccountId: { in: accounts.map((a) => a.id) },
        date: { gte: prevFrom, lte: from },
      },
    })

    if (prevSnapshots.length > 0) {
      const pSpend = prevSnapshots.reduce((s, r) => s + Number(r.spend), 0)
      const pImp = prevSnapshots.reduce((s, r) => s + Number(r.impressions), 0)
      const pClicks = prevSnapshots.reduce((s, r) => s + Number(r.clicks), 0)
      const pConv = prevSnapshots.reduce((s, r) => s + r.conversions, 0)
      const pRev = prevSnapshots.reduce((s, r) => s + Number(r.revenue ?? 0), 0)
      const pDerived = calculateDerivedMetrics({
        date: '',
        platform: 'META_ADS',
        externalAccountId: accounts[0]?.id ?? '',
        impressions: pImp,
        clicks: pClicks,
        spend: pSpend,
        conversions: pConv,
        revenue: pRev,
        rawData: null,
      })
      previousData = {
        totalSpend: pSpend,
        roas: pDerived.roas,
        cpa: pDerived.cpa,
        ctr: pDerived.ctr,
      }
    }
  }

  // Gerar insight com Claude
  const ctx = {
    clientName: clientData.name,
    strategyName: strategyData?.name,
    periodDays,
    totalSpend: totSpend,
    totalRevenue: totRev,
    totalImpressions: totImp,
    totalClicks: totClicks,
    totalConversions: totConv,
    roas: derived.roas,
    cpa: derived.cpa,
    ctr: derived.ctr,
    cpm: derived.cpm,
    previous: previousData,
  }

  const result = await generateLlmInsight(insightType, ctx)

  // Persistir AiInsight com metadata de tokens
  await db.aiInsight.create({
    data: {
      clientId,
      strategyId: strategyId || null,
      type: insightType,
      severity: 'INFO',
      title: result.title,
      body: result.body,
      source: 'LLM',
      metadata: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: (result.inputTokens * 0.000003 + result.outputTokens * 0.000015).toFixed(6),
        cacheKey,
      },
    },
  })

  log.info({
    clientId,
    insightType,
    tokens: result.inputTokens + result.outputTokens,
  }, 'Insight LLM persistido')
}

export { db }
