import type { PrismaClient, Severity } from '@prisma/client'
import { subHours } from 'date-fns'
import { NotFoundError } from '../../shared/errors/index.js'

interface ListOptions {
  onlyUnread?: boolean | undefined
  severity?: Severity | undefined
  limit?: number | undefined
}

interface CreateFromRuleInput {
  clientId: string
  strategyId?: string | undefined
  adAccountId: string
  severity: Severity
  title: string
  body: string
  ruleKey?: string | undefined  // para deduplicação
}

export class AiInsightsService {
  constructor(private readonly db: PrismaClient) {}

  async list(clientId: string, options: ListOptions = {}) {
    return this.db.aiInsight.findMany({
      where: {
        clientId,
        ...(options.onlyUnread && { readAt: null }),
        ...(options.severity && { severity: options.severity }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    })
  }

  async markAsRead(id: string, clientId: string) {
    const existing = await this.db.aiInsight.findFirst({
      where: { id, clientId },
    })

    if (!existing) throw new NotFoundError('Insight não encontrado')

    // Idempotente — não sobrescreve readAt já definido
    if (existing.readAt) return existing

    return this.db.aiInsight.update({
      where: { id },
      data: { readAt: new Date() },
    })
  }

  async markAllAsRead(clientId: string) {
    return this.db.aiInsight.updateMany({
      where: { clientId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  /**
   * Persiste um insight gerado pelo Rules Engine.
   * Deduplicação: ignora se já existe um insight com o mesmo ruleKey
   * para a mesma conta nas últimas 24h.
   */
  async createFromRuleResult(input: CreateFromRuleInput): Promise<import('@prisma/client').AiInsight | null> {
    // Verificar duplicata nas últimas 24h
    if (input.ruleKey) {
      const recent = await this.db.aiInsight.findFirst({
        where: {
          clientId: input.clientId,
          source: 'RULES_ENGINE',
          createdAt: { gte: subHours(new Date(), 24) },
          metadata: {
            path: ['adAccountId'],
            equals: input.adAccountId,
          },
        },
      })

      // Check ruleKey in metadata — Prisma JSON path filter handles this partially
      // do a secondary check in memory
      if (recent) {
        const meta = recent.metadata as Record<string, unknown> | null
        if (meta?.['ruleKey'] === input.ruleKey) return null
      }
    }

    const result = await this.db.aiInsight.create({
      data: {
        clientId: input.clientId,
        strategyId: input.strategyId ?? null,
        type: 'ALERT',
        severity: input.severity,
        title: input.title,
        body: input.body,
        source: 'RULES_ENGINE',
        metadata: {
          adAccountId: input.adAccountId,
          ruleKey: input.ruleKey ?? null,
        } as object,
      },
    })

    return result
  }
}
