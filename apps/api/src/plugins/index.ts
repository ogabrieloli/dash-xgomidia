import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { registerDatabase } from './database.js'
import { registerRedis } from './redis.js'
import { registerVault } from './vault.js'

export async function registerPlugins(app: FastifyInstance) {
  // Segurança
  await app.register(helmet, {
    contentSecurityPolicy: process.env['NODE_ENV'] === 'production',
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  })

  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(cookie, {
    secret: process.env['COOKIE_SECRET'] ?? 'dev-cookie-secret-change-in-production',
  })

  // Rate limiting
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })

  // Banco de dados, cache e secrets
  await registerDatabase(app)
  await registerRedis(app)
  await app.register(registerVault)
}
