/**
 * Rota pública para relatórios compartilhados via shareToken.
 *
 * ATENÇÃO: Esta rota é PÚBLICA — não requer autenticação.
 * Segurança garantida apenas pelo token de 32 bytes (64 hex chars) + expiração.
 */
import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { Queue } from 'bullmq'
import { ReportsService } from './reports.service.js'
import { AppError } from '../../shared/errors/index.js'
import { getSignedDownloadUrl } from '../../shared/utils/storage.js'
import { QUEUES, type ReportRenderJob } from '@xgo/shared-types'

const TokenParamsSchema = z.object({ token: z.string().length(64) })

function makeRenderQueue() {
  return new Queue<ReportRenderJob>(QUEUES.REPORT_RENDER, {
    connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
  })
}

export async function shareRoutes(app: FastifyInstance) {
  const renderQueue = makeRenderQueue()
  const service = new ReportsService(app.db, renderQueue)

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message ?? 'Token inválido' },
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

  // GET /r/:token — resolve token público e retorna metadados + URL de download
  app.get('/:token', async (request) => {
    const { token } = TokenParamsSchema.parse(request.params)

    const report = await service.findByShareToken(token)

    if (!report.storageKey) {
      throw new AppError('Arquivo do relatório não disponível', 404, 'REPORT_FILE_NOT_FOUND')
    }

    // URL pré-assinada com TTL de 1h — ainda dentro do prazo de segurança
    const downloadUrl = await getSignedDownloadUrl(report.storageKey, 3600)

    return {
      data: {
        id: report.id,
        title: report.title,
        type: report.type,
        clientName: report.client.name,
        generatedAt: report.generatedAt,
        expiresAt: report.shareExpiresAt,
        downloadUrl,
      },
    }
  })
}
