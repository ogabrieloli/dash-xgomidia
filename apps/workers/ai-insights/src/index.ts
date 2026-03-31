import pino from 'pino'
import { createWorker } from './worker.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

async function main() {
  log.info('Iniciando worker ai-insights...')
  const worker = createWorker()
  log.info('Worker ai-insights ativo')

  const shutdown = async () => {
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log.error({ err }, 'Erro fatal no worker ai-insights')
  process.exit(1)
})
