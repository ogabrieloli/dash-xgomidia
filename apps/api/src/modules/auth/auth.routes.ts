import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { AuthService } from './auth.service.js'
import { LoginBodySchema } from './auth.schema.js'
import { AppError, UnauthorizedError, ValidationError } from '../../shared/errors/index.js'

const REFRESH_COOKIE = 'refresh_token'
const REFRESH_TTL_SECONDS = 7 * 24 * 3600

function setCookieOptions(ttl: number) {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    path: '/auth',
    maxAge: ttl,
  }
}

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app.db)

  // ─────────────────────────────────────────────
  // Error handler local para este plugin
  // ─────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message ?? 'Dados inválidos' },
      })
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }

    app.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    })
  })

  // ─────────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = LoginBodySchema.parse(request.body)
    const result = await authService.login(body.email, body.password)

    reply.setCookie(REFRESH_COOKIE, result.refreshToken, setCookieOptions(REFRESH_TTL_SECONDS))

    return reply.status(200).send({
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    })
  })

  // ─────────────────────────────────────────────
  // POST /auth/refresh
  // ─────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE]
    if (!rawToken) {
      throw new UnauthorizedError('Refresh token ausente')
    }

    const result = await authService.refresh(rawToken)

    reply.setCookie(REFRESH_COOKIE, result.refreshToken, setCookieOptions(REFRESH_TTL_SECONDS))

    return reply.status(200).send({
      data: { accessToken: result.accessToken },
    })
  })

  // ─────────────────────────────────────────────
  // GET /auth/me — retorna o usuário atual + clientes acessíveis (CLIENT_VIEWER)
  // ─────────────────────────────────────────────
  app.get('/me', {
    preHandler: [async (request, reply) => {
      const { authenticate } = await import('../../shared/middleware/auth.middleware.js')
      await authenticate(request, reply)
    }],
  }, async (request) => {
    const userId = request.user.sub

    const user = await app.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        agencyId: true,
        clientAccess: {
          select: {
            clientId: true,
            client: { select: { name: true, slug: true } },
          },
        },
      },
    })

    if (!user) throw new UnauthorizedError('Usuário não encontrado')

    return {
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        agencyId: user.agencyId,
        accessibleClients: (user.clientAccess ?? []).map((a: { clientId: string; client: { name: string; slug: string } }) => ({
          clientId: a.clientId,
          name: a.client.name,
          slug: a.client.slug,
        })),
      },
    }
  })

  // ─────────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE]

    if (rawToken) {
      await authService.logout(rawToken)
    }

    // Limpar o cookie
    reply.clearCookie(REFRESH_COOKIE, { path: '/auth' })

    return reply.status(200).send({ data: { message: 'Logout realizado com sucesso' } })
  })
}
