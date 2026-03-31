import type { PrismaClient } from '@prisma/client'
import { NotFoundError } from '../../shared/errors/index.js'
import { audit } from '../../shared/utils/audit.js'

interface CreateProjectInput {
  name: string
  description?: string | undefined
}

interface UpdateProjectInput {
  name?: string | undefined
  description?: string | null | undefined
}

export class ProjectsService {
  constructor(private readonly db: PrismaClient) {}

  async list(clientId: string) {
    return this.db.project.findMany({
      where: { clientId, deletedAt: null },
      include: { strategies: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string, clientId: string) {
    return this.db.project.findFirst({
      where: { id, clientId, deletedAt: null },
      include: { strategies: { where: { deletedAt: null } } },
    })
  }

  async create(input: CreateProjectInput, clientId: string, userId: string) {
    const project = await this.db.project.create({
      data: {
        clientId,
        name: input.name,
        description: input.description ?? null,
      },
    })

    await audit(this.db, 'project.create', { type: 'Project', id: project.id }, {
      userId,
      after: { name: project.name, clientId },
    })

    return project
  }

  async update(id: string, input: UpdateProjectInput, clientId: string, userId: string) {
    const existing = await this.db.project.findFirst({
      where: { id, clientId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Projeto não encontrado')

    const updated = await this.db.project.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    })

    await audit(this.db, 'project.update', { type: 'Project', id }, {
      userId,
      before: { name: existing.name, description: existing.description },
      after: { name: updated.name, description: updated.description },
    })

    return updated
  }

  async softDelete(id: string, clientId: string, userId: string) {
    const existing = await this.db.project.findFirst({
      where: { id, clientId, deletedAt: null },
    })

    if (!existing) throw new NotFoundError('Projeto não encontrado')

    await this.db.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await audit(this.db, 'project.delete', { type: 'Project', id }, {
      userId,
      before: { name: existing.name },
    })
  }
}
