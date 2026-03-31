import pino from 'pino'
import { createWorker, db, notificationsQueue } from './worker.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

async function main() {
  log.info('Iniciando worker report-renderer...')

  const worker = createWorker()

  const shutdown = async () => {
    log.info('Encerrando worker report-renderer...')
    await worker.close()
    await notificationsQueue.close()
    await db.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  log.info('Worker report-renderer aguardando jobs...')
}

main().catch((err) => {
  log.error({ err }, 'Erro fatal no worker report-renderer')
  process.exit(1)
})
