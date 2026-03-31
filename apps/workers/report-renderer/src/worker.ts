/**
 * Worker BullMQ para renderização de relatórios PDF e PPT.
 *
 * Fluxo por job:
 *  1. Buscar Report + dados do cliente no banco
 *  2. Renderizar PDF (Puppeteer) ou PPT (pptxgenjs)
 *  3. Fazer upload para R2 Storage
 *  4. Atualizar Report: status DONE, storageKey, generatedAt
 *  5. Enfileirar NotificationJob para envio de e-mail
 */
import { Worker, Queue, type Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import pino from 'pino'
import { QUEUES, type ReportRenderJob, type NotificationJob } from '@xgo/shared-types'
import { renderPdf } from './renderers/pdf.js'
import { renderPpt } from './renderers/ppt.js'
import { uploadToStorage } from './storage.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const db = new PrismaClient()

const redisConnection = { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' }
const notificationsQueue = new Queue<NotificationJob>(QUEUES.NOTIFICATIONS, {
  connection: redisConnection,
})

async function processRenderJob(job: Job<ReportRenderJob>): Promise<void> {
  const { reportId, clientId, type } = job.data
  log.info({ jobId: job.id, reportId, type }, 'Iniciando renderização de relatório')

  // Marcar como PROCESSING
  await db.report.update({
    where: { id: reportId },
    data: { status: 'PROCESSING' },
  })

  // Buscar dados do relatório e cliente
  const report = await db.report.findFirst({
    where: { id: reportId, clientId },
    include: { client: { select: { name: true } } },
  })

  if (!report) {
    throw new Error(`Relatório não encontrado: ${reportId}`)
  }

  const config = report.config as Record<string, unknown>

  try {
    let fileBuffer: Buffer
    let contentType: string
    let extension: string

    if (type === 'PDF') {
      // Gerar token interno para rota de preview (TTL 5min)
      const previewToken = crypto.randomUUID()
      await db.report.update({
        where: { id: reportId },
        data: { shareToken: previewToken, shareExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      })

      fileBuffer = await renderPdf(reportId, previewToken)
      contentType = 'application/pdf'
      extension = 'pdf'
    } else if (type === 'PPT') {
      const pptConfig: Parameters<typeof renderPpt>[1] = {
        clientName: report.client.name,
      }
      const dr = config['dateRange'] as { from: string; to: string } | undefined
      if (dr) pptConfig.dateRange = dr
      const mt = config['metrics'] as Record<string, number> | undefined
      if (mt) pptConfig.metrics = mt
      const nt = config['notes'] as string | undefined
      if (nt) pptConfig.notes = nt

      fileBuffer = await renderPpt(report.title, pptConfig)
      contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      extension = 'pptx'
    } else {
      throw new Error(`Tipo de relatório não suportado: ${type}`)
    }

    const storageKey = `reports/${clientId}/${reportId}.${extension}`
    await uploadToStorage(storageKey, fileBuffer, contentType)

    // Atualizar relatório como DONE
    await db.report.update({
      where: { id: reportId },
      data: {
        status: 'DONE',
        storageKey,
        generatedAt: new Date(),
        // Limpa o token de preview após uso
        shareToken: null,
        shareExpiresAt: null,
        errorMessage: null,
      },
    })

    // Buscar e-mails dos usuários com acesso ao cliente
    const users = await db.user.findMany({
      where: {
        agency: {
          clients: { some: { id: clientId } },
        },
      },
      select: { email: true },
    })

    for (const user of users) {
      const notifPayload: NotificationJob = {
        type: 'REPORT_READY',
        recipientEmail: user.email,
        recipientName: user.email,
        payload: {
          reportId,
          reportTitle: report.title,
          reportType: type,
          clientName: report.client.name,
        },
      }

      await notificationsQueue.add('send', notifPayload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      })
    }

    log.info({ reportId, storageKey }, 'Relatório renderizado com sucesso')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    log.error({ reportId, err: message }, 'Erro ao renderizar relatório')

    await db.report.update({
      where: { id: reportId },
      data: { status: 'ERROR', errorMessage: message },
    })

    throw err
  }
}

export function createWorker() {
  const worker = new Worker<ReportRenderJob>(
    QUEUES.REPORT_RENDER,
    processRenderJob,
    {
      connection: redisConnection,
      concurrency: 2, // Puppeteer é pesado — limitar concorrência
    },
  )

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job de renderização concluído')
  })

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Job de renderização falhou')
  })

  return worker
}

export { db, notificationsQueue }
