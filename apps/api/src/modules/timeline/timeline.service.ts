import type { PrismaClient, TimelineEntryType } from '@prisma/client'
import { NotFoundError } from '../../shared/errors/index.js'

interface CreateTimelineInput {
  type: TimelineEntryType
  title: string
  body: string
  occurredAt: Date
}

interface ListOptions {
  type?: TimelineEntryType | undefined
  limit?: number | undefined
}

export class TimelineService {
  constructor(private readonly db: PrismaClient) {}

  async list(clientId: string, options: ListOptions = {}) {
    return this.db.timelineEntry.findMany({
      where: {
        clientId,
        ...(options.type && { type: options.type }),
      },
      orderBy: { occurredAt: 'desc' },
      take: options.limit ?? 100,
      include: {
        author: {
          select: { id: true, email: true },
        },
      },
    })
  }

  async create(input: CreateTimelineInput, clientId: string, authorId: string) {
    return this.db.timelineEntry.create({
      data: {
        clientId,
        authorId,
        type: input.type,
        title: input.title,
        body: input.body,
        occurredAt: input.occurredAt,
      },
      include: {
        author: { select: { id: true, email: true } },
      },
    })
  }

  async delete(id: string, clientId: string, requesterId: string) {
    const existing = await this.db.timelineEntry.findFirst({
      where: { id, clientId },
    })

    if (!existing) throw new NotFoundError('Entrada de timeline não encontrada')

    // Só o autor ou um admin pode deletar — verificação de autorId feita nas rotas
    await this.db.timelineEntry.delete({ where: { id } })
  }

  /**
   * Cria uma entrada de ALERT no timeline — chamado automaticamente pelo Rules Engine.
   */
  async createAlert(
    clientId: string,
    title: string,
    body: string,
    systemUserId: string,
  ) {
    return this.db.timelineEntry.create({
      data: {
        clientId,
        authorId: systemUserId,
        type: 'ALERT',
        title,
        body,
        occurredAt: new Date(),
      },
    })
  }
}
