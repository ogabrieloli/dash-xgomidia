import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyRequest } from 'fastify'

interface AuditOptions {
  userId?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  req?: FastifyRequest
}

// Campos sensíveis que NUNCA devem aparecer no AuditLog
const SENSITIVE_FIELDS = [
  'passwordHash',
  'password',
  'accessToken',
  'refreshToken',
  'token',
  'secret',
  'key',
  'vaultSecretPath', // path do Vault — não é secreto em si, mas é sensível
]

function sanitize(obj?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!obj) return undefined

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Registra uma entrada de auditoria.
 *
 * Usar em todo service que modifica dados sensíveis:
 * - login/logout
 * - criação/edição/exclusão de clientes
 * - vinculação de conta de anúncio
 * - geração de relatório
 * - geração de link compartilhável
 * - mudança de permissões
 */
export async function audit(
  db: PrismaClient,
  action: string,
  resource: { type: string; id: string },
  options: AuditOptions = {},
): Promise<void> {
  const beforeData = sanitize(options.before)
  const afterData = sanitize(options.after)

  await db.auditLog.create({
    data: {
      userId: options.userId ?? null,
      action,
      resourceType: resource.type,
      resourceId: resource.id,
      before: beforeData !== undefined ? (beforeData as Prisma.InputJsonObject) : Prisma.DbNull,
      after: afterData !== undefined ? (afterData as Prisma.InputJsonObject) : Prisma.DbNull,
      ipAddress: options.req?.ip ?? null,
      userAgent: options.req?.headers['user-agent'] ?? null,
    },
  })
}
