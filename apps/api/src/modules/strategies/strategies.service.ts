import type { PrismaClient, StrategyObjective } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { FunnelType } from '@xgo/shared-types'
import { NotFoundError } from '../../shared/errors/index.js'
import { audit } from '../../shared/utils/audit.js'

interface CreateStrategyInput {
  name: string
  funnelType: FunnelType
  metricConfig: Record<string, unknown>
  objective?: StrategyObjective | undefined
  budget?: number | undefined
}

interface UpdateStrategyInput {
  name?: string | undefined
  funnelType?: FunnelType | undefined
  objective?: StrategyObjective | null | undefined
  budget?: number | null | undefined
}

export class StrategiesService {
  constructor(private readonly db: PrismaClient) {}

  async list(projectId: string) {
    return this.db.strategy.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string, projectId: string) {
    return this.db.strategy.findFirst({
      where: { id, projectId, deletedAt: null },
    })
  }

  async create(input: CreateStrategyInput, projectId: string, userId: string) {
    const strategy = await this.db.strategy.create({
      data: {
        projectId,
        name: input.name,
        funnelType: input.funnelType,
        metricConfig: input.metricConfig as Prisma.InputJsonObject,
        objective: input.objective ?? null,
        budget: input.budget ?? null,
      },
    })

    await audit(this.db, 'strategy.create', { type: 'Strategy', id: strategy.id }, {
      userId,
      after: { name: strategy.name, funnelType: strategy.funnelType },
    })

    return strategy
  }

  async update(id: string, input: UpdateStrategyInput, projectId: string, userId: string) {
    const existing = await this.db.strategy.findFirst({
      where: { id, projectId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Estratégia não encontrada')

    const updated = await this.db.strategy.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.funnelType !== undefined && { funnelType: input.funnelType }),
        ...(input.objective !== undefined && { objective: input.objective }),
        ...(input.budget !== undefined && { budget: input.budget }),
      },
    })

    await audit(this.db, 'strategy.update', { type: 'Strategy', id }, {
      userId,
      before: { name: existing.name, funnelType: existing.funnelType },
      after: { name: updated.name, funnelType: updated.funnelType },
    })

    return updated
  }

  async updateDashboardConfig(id: string, dashboardConfig: Record<string, unknown>, userId: string) {
    const existing = await this.db.strategy.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Estratégia não encontrada')

    return this.db.strategy.update({
      where: { id },
      data: { dashboardConfig: dashboardConfig as Prisma.InputJsonObject },
    })
  }

  async updateMetricConfig(id: string, metricConfig: Record<string, unknown>, userId: string) {
    const existing = await this.db.strategy.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Estratégia não encontrada')

    const updated = await this.db.strategy.update({
      where: { id },
      data: { metricConfig: metricConfig as Prisma.InputJsonObject },
    })

    await audit(this.db, 'strategy.updateMetricConfig', { type: 'Strategy', id }, {
      userId,
      before: { metricConfig: existing.metricConfig },
      after: { metricConfig: updated.metricConfig },
    })

    return updated
  }

  async softDelete(id: string, projectId: string, userId: string) {
    const existing = await this.db.strategy.findFirst({
      where: { id, projectId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Estratégia não encontrada')

    await this.db.strategy.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await audit(this.db, 'strategy.delete', { type: 'Strategy', id }, {
      userId,
      before: { name: existing.name },
    })
  }
}
