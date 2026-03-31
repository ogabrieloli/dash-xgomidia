/**
 * Testes do middleware de autenticação JWT.
 * Não precisa de banco — testa apenas verificação de token.
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'
import { authenticate, requireRole } from './auth.middleware.js'

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long'

function makeValidToken(overrides: Partial<{
  sub: string
  role: string
  agencyId: string
  exp: number
}> = {}) {
  return jwt.sign(
    {
      sub: overrides.sub ?? 'user-id-123',
      role: overrides.role ?? 'AGENCY_ADMIN',
      agencyId: overrides.agencyId ?? 'agency-id-123',
    },
    JWT_SECRET,
    { expiresIn: overrides.exp !== undefined ? 0 : '15m' },
  )
}

async function buildTestApp() {
  const app = Fastify({ logger: false })

  app.get(
    '/protected',
    { preHandler: [authenticate] },
    async (req) => ({ userId: req.user.sub, role: req.user.role }),
  )

  app.get(
    '/admin-only',
    { preHandler: [authenticate, requireRole('AGENCY_ADMIN')] },
    async () => ({ ok: true }),
  )

  app.get(
    '/manager-or-admin',
    { preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')] },
    async () => ({ ok: true }),
  )

  // Error handler simplificado para testes
  app.setErrorHandler((err, _req, reply) => {
    reply.status(err.statusCode ?? 500).send({
      error: { code: (err as { code?: string }).code ?? 'ERROR', message: err.message },
    })
  })

  return app
}

describe('authenticate middleware', () => {
  it('permite acesso com Bearer token JWT válido', async () => {
    const app = await buildTestApp()
    const token = makeValidToken({ sub: 'user-abc', role: 'AGENCY_ADMIN' })

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().userId).toBe('user-abc')
    expect(res.json().role).toBe('AGENCY_ADMIN')
  })

  it('retorna 401 quando Authorization header está ausente', async () => {
    const app = await buildTestApp()

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
    })

    expect(res.statusCode).toBe(401)
  })

  it('retorna 401 quando token não tem prefixo Bearer', async () => {
    const app = await buildTestApp()
    const token = makeValidToken()

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: token },
    })

    expect(res.statusCode).toBe(401)
  })

  it('retorna 401 com token expirado', async () => {
    const app = await buildTestApp()
    const token = jwt.sign(
      { sub: 'user-123', role: 'AGENCY_ADMIN', agencyId: 'agency-123' },
      JWT_SECRET,
      { expiresIn: -1 }, // já expirado
    )

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toContain('expirado')
  })

  it('retorna 401 com token assinado com secret errado', async () => {
    const app = await buildTestApp()
    const token = jwt.sign(
      { sub: 'user-123', role: 'AGENCY_ADMIN', agencyId: 'agency-123' },
      'secret-errado',
    )

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('requireRole middleware', () => {
  it('permite acesso quando usuário tem o role exato', async () => {
    const app = await buildTestApp()
    const token = makeValidToken({ role: 'AGENCY_ADMIN' })

    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('retorna 403 quando usuário não tem o role necessário', async () => {
    const app = await buildTestApp()
    const token = makeValidToken({ role: 'CLIENT_VIEWER' })

    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(403)
  })

  it('permite acesso quando usuário tem um dos roles aceitos', async () => {
    const app = await buildTestApp()
    const tokenManager = makeValidToken({ role: 'AGENCY_MANAGER' })

    const res = await app.inject({
      method: 'GET',
      url: '/manager-or-admin',
      headers: { authorization: `Bearer ${tokenManager}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('CLIENT_VIEWER não acessa rota de manager/admin', async () => {
    const app = await buildTestApp()
    const token = makeValidToken({ role: 'CLIENT_VIEWER' })

    const res = await app.inject({
      method: 'GET',
      url: '/manager-or-admin',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(403)
  })
})
