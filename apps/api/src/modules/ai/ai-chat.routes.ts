/**
 * Endpoint de chat de IA por estratégia.
 *
 * Fluxo:
 *  1. Recebe pergunta do usuário + strategyId
 *  2. Busca métricas recentes (30 dias) da estratégia/cliente
 *  3. Chama Claude API com contexto das métricas
 *  4. Retorna resposta
 *
 * Segurança: não persiste histórico de chat — sem PII armazenada.
 * Rate limit implícito pelo plano da Anthropic API.
 */
import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { Queue } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware.js'
import { assertClientAccess } from '../../shared/guards/client-access.guard.js'
import { AppError } from '../../shared/errors/index.js'
import { calculateDerivedMetrics } from '@xgo/metrics-schema'
import { subDays } from 'date-fns'
import { QUEUES, type AiInsightsJob } from '@xgo/shared-types'

const ChatSchema = z.object({
  strategyId: z.string().uuid(),
  clientId: z.string().uuid(),
  question: z.string().min(3).max(1000).trim(),
})

const MODEL = 'claude-sonnet-4-20250514'

export async function aiChatRoutes(app: FastifyInstance) {
  const anthropic = new Anthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'],
  })

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

  // POST /api/ai/chat
  app.post('/chat', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER', 'CLIENT_VIEWER')],
  }, async (request) => {
    const body = ChatSchema.parse(request.body)
    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    // Buscar dados da estratégia + cliente
    const strategy = await app.db.strategy.findFirst({
      where: { id: body.strategyId, project: { clientId: body.clientId } },
      select: { name: true, project: { select: { client: { select: { name: true } } } } },
    })

    if (!strategy) {
      throw new AppError('Estratégia não encontrada', 404, 'STRATEGY_NOT_FOUND')
    }

    // Buscar métricas dos últimos 30 dias
    const accounts = await app.db.adAccount.findMany({
      where: { clientId: body.clientId, syncStatus: 'SUCCESS' },
      select: { id: true },
    })

    const today = new Date()
    const from = subDays(today, 30)

    let contextLines = `Estratégia: ${strategy.name}\nCliente: ${strategy.project.client.name}`

    if (accounts.length > 0) {
      const snapshots = await app.db.metricSnapshot.findMany({
        where: {
          adAccountId: { in: accounts.map((a) => a.id) },
          date: { gte: from, lte: today },
        },
      })

      if (snapshots.length > 0) {
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

        contextLines += `\n\nMétricas dos últimos 30 dias:
- Investimento: R$ ${totSpend.toFixed(2)}
- Receita: R$ ${totRev.toFixed(2)}
- ROAS: ${derived.roas.toFixed(2)}x
- CPA: R$ ${derived.cpa.toFixed(2)}
- CTR: ${derived.ctr.toFixed(2)}%
- CPM: R$ ${derived.cpm.toFixed(2)}
- Impressões: ${totImp.toLocaleString('pt-BR')}
- Cliques: ${totClicks.toLocaleString('pt-BR')}
- Conversões: ${totConv}`
      }
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `Você é um especialista em tráfego pago da agência XGO Midia.
Responda em português do Brasil de forma clara e objetiva.
Use os dados fornecidos para fundamentar suas respostas.
Seja direto e prático.`,
      messages: [
        {
          role: 'user',
          content: `${contextLines}\n\nPergunta: ${body.question}`,
        },
      ],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new AppError('Resposta inesperada da IA', 500, 'AI_ERROR')
    }

    return {
      data: {
        answer: content.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      },
    }
  })

  // POST /api/ai/insights/generate — gera insight LLM manualmente
  app.post('/insights/generate', {
    preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')],
  }, async (request, reply) => {
    const body = z.object({
      strategyId: z.string().uuid().optional(),
      clientId: z.string().uuid(),
      type: z.enum(['SUMMARY', 'COMPARISON', 'SUGGESTION']),
    }).parse(request.body)

    await assertClientAccess(request.user.sub, request.user.role, body.clientId, app.db)

    // Enfileirar job de insights LLM
    const insightsQueue = new Queue<AiInsightsJob>(QUEUES.AI_INSIGHTS, {
      connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
    })

    const jobId = `llm-${body.type.toLowerCase()}-${body.strategyId ?? body.clientId}-${Date.now()}`

    await insightsQueue.add('generate-llm', {
      strategyId: body.strategyId ?? '',
      clientId: body.clientId,
      insightType: body.type,
      triggeredBy: 'manual',
    }, { jobId })

    await insightsQueue.close()

    return reply.status(202).send({ data: { jobId, message: 'Insight LLM enfileirado' } })
  })
}
