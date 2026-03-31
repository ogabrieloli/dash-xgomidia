import pino from 'pino'
import { createWorker } from './worker.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

async function main() {
  log.info('Iniciando worker notifications...')

  const worker = createWorker()

  const shutdown = async () => {
    log.info('Encerrando worker notifications...')
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  log.info('Worker notifications aguardando jobs...')
}

main().catch((err) => {
  log.error({ err }, 'Erro fatal no worker notifications')
  process.exit(1)
})
