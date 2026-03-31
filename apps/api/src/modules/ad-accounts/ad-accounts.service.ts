import type { PrismaClient, SyncStatus } from '@prisma/client'
import type { Platform } from '@xgo/shared-types'
import { NotFoundError } from '../../shared/errors/index.js'
import { audit } from '../../shared/utils/audit.js'

interface CreateAdAccountInput {
  platform: Platform
  externalId: string
  name: string
  vaultSecretPath: string
  currency?: string | undefined
  timezone?: string | undefined
}

export class AdAccountsService {
  constructor(private readonly db: PrismaClient) {}

  async list(clientId: string) {
    return this.db.adAccount.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async findById(id: string, clientId: string) {
    return this.db.adAccount.findFirst({
      where: { id, clientId },
    })
  }

  async create(input: CreateAdAccountInput, clientId: string, userId: string) {
    const account = await this.db.adAccount.create({
      data: {
        clientId,
        platform: input.platform,
        externalId: input.externalId,
        name: input.name,
        vaultSecretPath: input.vaultSecretPath,
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    })

    await audit(this.db, 'adAccount.connect', { type: 'AdAccount', id: account.id }, {
      userId,
      after: {
        platform: account.platform,
        externalId: account.externalId,
        name: account.name,
        clientId,
      },
    })

    return account
  }

  async updateSyncStatus(id: string, status: SyncStatus, errorMessage?: string | undefined) {
    await this.db.adAccount.update({
      where: { id },
      data: {
        syncStatus: status,
        ...(status === 'SUCCESS' && {
          lastSyncAt: new Date(),
          syncError: null,
        }),
        ...(status === 'ERROR' && errorMessage !== undefined && {
          syncError: errorMessage,
        }),
      },
    })
  }

  async delete(id: string, clientId: string, userId: string) {
    const existing = await this.db.adAccount.findFirst({
      where: { id, clientId },
    })

    if (!existing) throw new NotFoundError('Conta de anúncio não encontrada')

    await this.db.adAccount.delete({ where: { id } })

    await audit(this.db, 'adAccount.disconnect', { type: 'AdAccount', id }, {
      userId,
      before: {
        platform: existing.platform,
        externalId: existing.externalId,
        name: existing.name,
      },
    })
  }
}
