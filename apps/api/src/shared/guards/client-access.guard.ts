import type { PrismaClient } from '@prisma/client'
import type { UserRole } from '@xgo/shared-types'
import { ForbiddenError } from '../errors/index.js'

/**
 * Guard de acesso obrigatório para dados de cliente.
 *
 * REGRA: Toda query que retorna dados de cliente DEVE passar por este guard
 * antes de executar qualquer query ao banco.
 *
 * Uso:
 *   await assertClientAccess(request.user.sub, request.user.role, clientId, app.db)
 *   // Se chegou aqui, o acesso foi autorizado
 *   const data = await db.client.findFirst({ where: { id: clientId } })
 */
export async function assertClientAccess(
  userId: string,
  userRole: UserRole,
  clientId: string,
  db: PrismaClient,
): Promise<void> {
  // AGENCY_ADMIN tem acesso a todos os clientes da sua agência
  if (userRole === 'AGENCY_ADMIN') return

  // AGENCY_MANAGER: verificar se o cliente pertence à agência do manager
  if (userRole === 'AGENCY_MANAGER') {
    const client = await db.client.findFirst({
      where: {
        id: clientId,
        deletedAt: null,
        agency: {
          users: {
            some: { id: userId, deletedAt: null },
          },
        },
      },
      select: { id: true },
    })

    if (!client) {
      throw new ForbiddenError('Acesso negado a este cliente')
    }
    return
  }

  // CLIENT_VIEWER: verificar acesso explícito via ClientUserAccess
  const access = await db.clientUserAccess.findUnique({
    where: {
      clientId_userId: { clientId, userId },
    },
    select: { id: true },
  })

  if (!access) {
    throw new ForbiddenError('Acesso negado a este cliente')
  }
}
