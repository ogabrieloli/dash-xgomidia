/**
 * Claude LLM Engine — gera insights analíticos usando a Claude API.
 *
 * Tipos de insight suportados:
 *  - SUMMARY: resumo semanal das métricas da campanha
 *  - COMPARISON: comparação vs período anterior
 *  - SUGGESTION: sugestões de otimização baseadas nos dados
 *
 * Cache de 24h: nunca gerar novo insight se já existe do mesmo tipo/estratégia/dia.
 * Logs de tokens consumidos em AiInsight.metadata para controle de custo.
 */
import Anthropic from '@anthropic-ai/sdk'
import pino from 'pino'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

const client = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
})

// Modelo a usar — conforme plan: claude-sonnet-4-20250514
const MODEL = 'claude-sonnet-4-20250514'

interface MetricContext {
  strategyName?: string | undefined
  clientName: string
  periodDays: number
  totalSpend: number
  totalRevenue: number
  totalImpressions: number
  totalClicks: number
  totalConversions: number
  roas: number
  cpa: number
  ctr: number
  cpm: number
  // Para COMPARISON — dados do período anterior
  previous?: {
    totalSpend: number
    roas: number
    cpa: number
    ctr: number
  } | undefined
}

interface LlmInsightResult {
  title: string
  body: string
  inputTokens: number
  outputTokens: number
}

function buildSystemPrompt(): string {
  return `Você é um especialista em tráfego pago e marketing digital trabalhando para a agência XGO Midia.
Sua função é analisar dados de campanhas de anúncios e gerar insights claros e acionáveis em português do Brasil.
Seja objetivo, direto e use linguagem profissional mas acessível.
Foque em implicações práticas e próximas ações. Nunca invente dados que não foram fornecidos.
Responda sempre em formato JSON: { "title": "string", "body": "string" }`
}

function buildSummaryPrompt(ctx: MetricContext): string {
  const period = ctx.periodDays === 7 ? 'últimos 7 dias' : `últimos ${ctx.periodDays} dias`

  return `Gere um RESUMO das métricas de campanha para:
Cliente: ${ctx.clientName}
${ctx.strategyName ? `Estratégia: ${ctx.strategyName}` : ''}
Período: ${period} (até ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })})

Dados do período:
- Investimento: R$ ${ctx.totalSpend.toFixed(2)}
- Receita: R$ ${ctx.totalRevenue.toFixed(2)}
- ROAS: ${ctx.roas.toFixed(2)}x
- CPA: R$ ${ctx.cpa.toFixed(2)}
- CTR: ${ctx.ctr.toFixed(2)}%
- CPM: R$ ${ctx.cpm.toFixed(2)}
- Impressões: ${ctx.totalImpressions.toLocaleString('pt-BR')}
- Cliques: ${ctx.totalClicks.toLocaleString('pt-BR')}
- Conversões: ${ctx.totalConversions}

Gere um resumo executivo em 2-3 parágrafos destacando os principais resultados e performance geral.
O título deve ser conciso (máx 80 chars). O body deve ter no máximo 400 palavras.`
}

function buildComparisonPrompt(ctx: MetricContext): string {
  if (!ctx.previous) {
    return buildSummaryPrompt(ctx)
  }

  const roasChange = ((ctx.roas - ctx.previous.roas) / ctx.previous.roas * 100).toFixed(1)
  const cpaChange = ((ctx.cpa - ctx.previous.cpa) / ctx.previous.cpa * 100).toFixed(1)
  const spendChange = ((ctx.totalSpend - ctx.previous.totalSpend) / ctx.previous.totalSpend * 100).toFixed(1)

  return `Gere uma ANÁLISE COMPARATIVA das métricas de campanha para:
Cliente: ${ctx.clientName}
${ctx.strategyName ? `Estratégia: ${ctx.strategyName}` : ''}

Período atual (últimos ${ctx.periodDays} dias):
- Investimento: R$ ${ctx.totalSpend.toFixed(2)} (${Number(spendChange) >= 0 ? '+' : ''}${spendChange}%)
- ROAS: ${ctx.roas.toFixed(2)}x (${Number(roasChange) >= 0 ? '+' : ''}${roasChange}% vs anterior)
- CPA: R$ ${ctx.cpa.toFixed(2)} (${Number(cpaChange) >= 0 ? '+' : ''}${cpaChange}% vs anterior)
- CTR: ${ctx.ctr.toFixed(2)}%

Período anterior:
- Investimento: R$ ${ctx.previous.totalSpend.toFixed(2)}
- ROAS: ${ctx.previous.roas.toFixed(2)}x
- CPA: R$ ${ctx.previous.cpa.toFixed(2)}
- CTR: ${ctx.previous.ctr.toFixed(2)}%

Analise as variações e explique as possíveis causas e impactos nos resultados.
Máx 350 palavras no body.`
}

function buildSuggestionPrompt(ctx: MetricContext): string {
  return `Gere SUGESTÕES DE OTIMIZAÇÃO para a campanha:
Cliente: ${ctx.clientName}
${ctx.strategyName ? `Estratégia: ${ctx.strategyName}` : ''}

Métricas atuais (últimos ${ctx.periodDays} dias):
- ROAS: ${ctx.roas.toFixed(2)}x
- CPA: R$ ${ctx.cpa.toFixed(2)}
- CTR: ${ctx.ctr.toFixed(2)}%
- CPM: R$ ${ctx.cpm.toFixed(2)}
- Investimento total: R$ ${ctx.totalSpend.toFixed(2)}

Com base nesses dados, gere 3-5 sugestões práticas e específicas de otimização.
Cada sugestão deve ter uma ação clara e o impacto esperado.
Máx 400 palavras no body.`
}

export async function generateLlmInsight(
  type: 'SUMMARY' | 'COMPARISON' | 'SUGGESTION',
  ctx: MetricContext,
): Promise<LlmInsightResult> {
  const prompt = type === 'SUMMARY'
    ? buildSummaryPrompt(ctx)
    : type === 'COMPARISON'
    ? buildComparisonPrompt(ctx)
    : buildSuggestionPrompt(ctx)

  log.info({ type, clientName: ctx.clientName }, 'Gerando insight com Claude API')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Resposta inesperada da Claude API')
  }

  // Extrair JSON da resposta
  let parsed: { title: string; body: string }
  try {
    // Tentar extrair JSON de possível markdown code block
    const jsonMatch = content.text.match(/```json\s*([\s\S]*?)\s*```/) ??
      content.text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : content.text
    parsed = JSON.parse(jsonStr) as { title: string; body: string }
  } catch {
    // Se não for JSON válido, usar o texto diretamente
    const lines = content.text.trim().split('\n')
    parsed = {
      title: lines[0]?.replace(/^#\s*/, '') ?? `${type} — ${ctx.clientName}`,
      body: lines.slice(1).join('\n').trim(),
    }
  }

  log.info({
    type,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }, 'Insight gerado com sucesso')

  return {
    title: parsed.title.slice(0, 200),
    body: parsed.body,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

/**
 * Chat de IA por estratégia — responde perguntas livres com contexto das métricas.
 */
export async function chatWithContext(
  question: string,
  ctx: MetricContext,
): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
  const contextSummary = `Contexto da campanha:
Cliente: ${ctx.clientName}
${ctx.strategyName ? `Estratégia: ${ctx.strategyName}` : ''}
Últimos ${ctx.periodDays} dias:
- Investimento: R$ ${ctx.totalSpend.toFixed(2)}
- Receita: R$ ${ctx.totalRevenue.toFixed(2)}
- ROAS: ${ctx.roas.toFixed(2)}x
- CPA: R$ ${ctx.cpa.toFixed(2)}
- CTR: ${ctx.ctr.toFixed(2)}%
- CPM: R$ ${ctx.cpm.toFixed(2)}
- Conversões: ${ctx.totalConversions}`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `Você é um especialista em tráfego pago da agência XGO Midia.
Responda em português do Brasil de forma clara e objetiva.
Use os dados fornecidos para fundamentar suas respostas.`,
    messages: [
      {
        role: 'user',
        content: `${contextSummary}\n\nPergunta: ${question}`,
      },
    ],
  })

  const content = response.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Resposta inesperada da Claude API')
  }

  return {
    answer: content.text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

export { subDays }
