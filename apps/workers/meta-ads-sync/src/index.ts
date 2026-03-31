/**
 * Entry point do worker meta-ads-sync.
 * Inicia o worker BullMQ e aguarda jobs da fila.
 */
import pino from 'pino'
import { createWorker } from './worker.js'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

async function main() {
  log.info('Iniciando worker meta-ads-sync...')

  const worker = createWorker()

  log.info('Worker meta-ads-sync ativo — aguardando jobs')

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Encerrando worker meta-ads-sync...')
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log.error({ err }, 'Erro fatal no worker meta-ads-sync')
  process.exit(1)
})
