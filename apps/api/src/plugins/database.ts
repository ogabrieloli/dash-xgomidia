import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient
  }
}

const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

export const registerDatabase = fp(async (app: FastifyInstance) => {
  await prisma.$connect()

  app.decorate('db', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  app.log.info('Database connected')
})
