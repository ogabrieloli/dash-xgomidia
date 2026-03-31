import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import type { JwtPayload, UserRole } from '@xgo/shared-types'
import { UnauthorizedError, ForbiddenError } from '../errors/index.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}

/**
 * Middleware de autenticação — verificar Bearer token JWT.
 * Usar como preHandler em todas as rotas protegidas.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token de acesso ausente')
  }

  const token = authHeader.slice(7)
  const secret = process.env['JWT_SECRET']
  if (!secret) throw new Error('JWT_SECRET não configurado')

  try {
    const payload = jwt.verify(token, secret) as JwtPayload
    request.user = payload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expirado')
    }
    throw new UnauthorizedError('Token inválido')
  }
}

/**
 * Decorator de permissão — usar em rotas que precisam de role específica.
 * Combinar com authenticate:
 *
 *   preHandler: [authenticate, requireRole('AGENCY_ADMIN', 'AGENCY_MANAGER')]
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError()
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Permissão insuficiente para esta operação')
    }
  }
}
