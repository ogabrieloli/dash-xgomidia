import type { PrismaClient, ReportStatus, ReportType } from '@prisma/client'
import type { Queue } from 'bullmq'
import { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import type { ReportRenderJob } from '@xgo/shared-types'
import { NotFoundError, AppError } from '../../shared/errors/index.js'

interface CreateReportInput {
  clientId: string
  strategyId?: string | undefined
  title: string
  type: ReportType
  config: Record<string, unknown>
}

interface UpdateStatusOptions {
  storageKey?: string | undefined
  errorMessage?: string | undefined
}

export class ReportsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly renderQueue: Queue<ReportRenderJob>,
  ) {}

  async create(input: CreateReportInput) {
    const report = await this.db.report.create({
      data: {
        clientId: input.clientId,
        strategyId: input.strategyId ?? null,
        title: input.title,
        type: input.type,
        status: 'PENDING',
        config: input.config as Prisma.InputJsonObject,
      },
    })

    const payload: ReportRenderJob = {
      reportId: report.id,
      clientId: input.clientId,
      type: input.type,
    }

    await this.renderQueue.add('render', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      jobId: `render-${report.id}`,
    })

    return report
  }

  async list(clientId: string) {
    return this.db.report.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string, clientId: string) {
    const report = await this.db.report.findFirst({
      where: { id, clientId },
    })

    if (!report) throw new NotFoundError('Relatório não encontrado')

    return report
  }

  async updateStatus(
    id: string,
    status: ReportStatus,
    options: UpdateStatusOptions = {},
  ) {
    if (status === 'DONE') {
      return this.db.report.update({
        where: { id },
        data: {
          status,
          storageKey: options.storageKey ?? null,
          generatedAt: new Date(),
          errorMessage: null,
        },
      })
    }

    if (status === 'ERROR') {
      return this.db.report.update({
        where: { id },
        data: {
          status,
          errorMessage: options.errorMessage ?? 'Erro desconhecido',
        },
      })
    }

    return this.db.report.update({
      where: { id },
      data: { status },
    })
  }

  /**
   * Gera shareToken de 32 bytes (64 hex chars) com expiração configurável.
   * REGRA: links compartilháveis têm expiração obrigatória.
   *
   * @param ttlHours TTL em horas (default: 72h)
   */
  async createShareLink(id: string, clientId: string, ttlHours = 72) {
    const report = await this.findById(id, clientId)

    if (report.status !== 'DONE') {
      throw new AppError('Apenas relatórios concluídos podem ser compartilhados', 409, 'REPORT_NOT_READY')
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    const updated = await this.db.report.update({
      where: { id },
      data: { shareToken: token, shareExpiresAt: expiresAt },
    })

    return { token: updated.shareToken!, expiresAt: updated.shareExpiresAt! }
  }

  /**
   * Resolve shareToken público — valida expiração e retorna o relatório.
   * Rota pública, sem autenticação.
   */
  async findByShareToken(token: string) {
    const report = await this.db.report.findUnique({
      where: { shareToken: token },
      include: { client: { select: { name: true, slug: true } } },
    })

    if (!report) throw new NotFoundError('Link não encontrado')
    if (!report.shareExpiresAt || report.shareExpiresAt < new Date()) {
      throw new AppError('Link expirado', 410, 'SHARE_LINK_EXPIRED')
    }

    return report
  }
}
