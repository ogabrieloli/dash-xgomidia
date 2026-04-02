import type { PrismaClient } from '@prisma/client'
import { NotFoundError, ConflictError } from '../../shared/errors/index.js'
import { audit } from '../../shared/utils/audit.js'

interface CreateClientInput {
  name: string
  slug: string
  logoUrl?: string | undefined
  operation?: string | undefined
  alreadyInvesting?: boolean | undefined
  initialInvestment?: number | undefined
  reportedRevenue?: number | undefined
  notes?: string | undefined
}

interface UpdateClientInput {
  name?: string | undefined
  logoUrl?: string | null | undefined
  operation?: string | null | undefined
  alreadyInvesting?: boolean | undefined
  initialInvestment?: number | null | undefined
  reportedRevenue?: number | null | undefined
  notes?: string | null | undefined
}

interface ListOptions {
  search?: string | undefined
}

export class ClientsService {
  constructor(private readonly db: PrismaClient) {}

  async list(agencyId: string, options: ListOptions = {}) {
    return this.db.client.findMany({
      where: {
        agencyId,
        deletedAt: null,
        ...(options.search
          ? { name: { contains: options.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { adAccounts: true } },
      },
    })
  }

  async findById(id: string, agencyId: string) {
    return this.db.client.findFirst({
      where: { id, agencyId, deletedAt: null },
      include: {
        projects: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: {
            strategies: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, funnelType: true, objective: true },
            },
          },
        },
        adAccounts: {
          select: { id: true, platform: true, name: true, syncStatus: true },
        },
      },
    })
  }

  async create(input: CreateClientInput, agencyId: string, userId: string) {
    // Verificar slug único
    const existing = await this.db.client.findUnique({ where: { slug: input.slug } })
    if (existing) {
      throw new ConflictError(`Slug '${input.slug}' já está em uso`)
    }

    const client = await this.db.client.create({
      data: {
        agencyId,
        name: input.name,
        slug: input.slug,
        logoUrl: input.logoUrl ?? null,
        operation: input.operation ?? null,
        alreadyInvesting: input.alreadyInvesting ?? false,
        initialInvestment: input.initialInvestment ?? null,
        reportedRevenue: input.reportedRevenue ?? null,
        notes: input.notes ?? null,
      },
    })

    await audit(this.db, 'client.create', { type: 'Client', id: client.id }, {
      userId,
      after: { name: client.name, slug: client.slug },
    })

    return client
  }

  async update(id: string, input: UpdateClientInput, agencyId: string, userId: string) {
    const existing = await this.db.client.findFirst({
      where: { id, agencyId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Cliente não encontrado')

    const updated = await this.db.client.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.operation !== undefined && { operation: input.operation }),
        ...(input.alreadyInvesting !== undefined && { alreadyInvesting: input.alreadyInvesting }),
        ...(input.initialInvestment !== undefined && { initialInvestment: input.initialInvestment }),
        ...(input.reportedRevenue !== undefined && { reportedRevenue: input.reportedRevenue }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    })

    await audit(this.db, 'client.update', { type: 'Client', id }, {
      userId,
      before: { name: existing.name, logoUrl: existing.logoUrl },
      after: { name: updated.name, logoUrl: updated.logoUrl },
    })

    return updated
  }

  async softDelete(id: string, agencyId: string, userId: string) {
    const existing = await this.db.client.findFirst({
      where: { id, agencyId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Cliente não encontrado')

    await this.db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await audit(this.db, 'client.delete', { type: 'Client', id }, {
      userId,
      before: { name: existing.name },
    })
  }
}
