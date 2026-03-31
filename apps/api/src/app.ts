import Fastify from 'fastify'
import { registerPlugins } from './plugins/index.js'
import { registerRoutes } from './modules/index.js'

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    redact: {
      paths: [
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.secret',
        '*.accessToken',
        '*.refreshToken',
        '*.key',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  },
})

await registerPlugins(app)
await registerRoutes(app)

const port = parseInt(process.env['PORT'] ?? '3001', 10)
const host = process.env['HOST'] ?? '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export { app }
