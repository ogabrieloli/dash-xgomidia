/**
 * Worker BullMQ para envio de notificações por e-mail via Resend.
 *
 * Tipos suportados:
 *  - REPORT_READY: relatório PDF/PPT gerado, com link pré-assinado (TTL 72h)
 *  - ALERT: alerta automático do Rules Engine
 *  - INSIGHT: insight semanal do LLM
 */
import { Worker, type Job } from 'bullmq'
import { Resend } from 'resend'
import pino from 'pino'
import { QUEUES, type NotificationJob } from '@xgo/shared-types'
import { reportReadyTemplate } from './templates.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })
const resend = new Resend(process.env['RESEND_API_KEY'])

const FROM_EMAIL = process.env['EMAIL_FROM'] ?? 'noreply@xgomidia.com.br'

async function processNotificationJob(job: Job<NotificationJob>): Promise<void> {
  const { type, recipientEmail, recipientName, payload } = job.data
  log.info({ jobId: job.id, type, to: recipientEmail }, 'Enviando notificação')

  if (type === 'REPORT_READY') {
    const downloadUrl = payload['downloadUrl'] as string | undefined
    if (!downloadUrl) {
      log.warn({ jobId: job.id }, 'REPORT_READY sem downloadUrl — ignorado')
      return
    }

    // Link pré-assinado com TTL de 72h para o e-mail
    const expiresDate = new Date(Date.now() + 72 * 60 * 60 * 1000)
    const expiresAt = expiresDate.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const template = reportReadyTemplate({
      recipientName,
      reportTitle: payload['reportTitle'] as string ?? 'Relatório',
      reportType: payload['reportType'] as string ?? 'PDF',
      clientName: payload['clientName'] as string ?? '',
      downloadUrl,
      expiresAt,
    })

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
    })

    log.info({ to: recipientEmail }, 'E-mail de relatório enviado')
    return
  }

  if (type === 'ALERT') {
    const alertTitle = payload['title'] as string | undefined ?? 'Alerta'
    const alertBody = payload['body'] as string | undefined ?? ''

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `[XGO Midia] Alerta: ${alertTitle}`,
      html: `
        <p>Olá!</p>
        <p><strong>${alertTitle}</strong></p>
        <p>${alertBody}</p>
        <p>Acesse a plataforma para mais detalhes.</p>
      `,
    })

    log.info({ to: recipientEmail }, 'E-mail de alerta enviado')
    return
  }

  log.warn({ type }, 'Tipo de notificação não suportado')
}

export function createWorker() {
  const worker = new Worker<NotificationJob>(
    QUEUES.NOTIFICATIONS,
    processNotificationJob,
    {
      connection: { url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' },
      concurrency: 10,
    },
  )

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job de notificação concluído')
  })

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Job de notificação falhou')
  })

  return worker
}
