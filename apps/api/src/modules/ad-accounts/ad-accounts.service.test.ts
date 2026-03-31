/**
 * Testes do AdAccountsService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { AdAccountsService } from './ad-accounts.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

describe('AdAccountsService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // list()
  // ─────────────────────────────────────────────

  describe('list()', () => {
    it('retorna todas as contas de anúncio do cliente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await testDb.adAccount.createMany({
        data: [
          {
            clientId: client.id,
            platform: 'META_ADS',
            externalId: 'act_111',
            name: 'Conta Meta 1',
            vaultSecretPath: 'secret/clients/test/meta-ads/act_111',
          },
          {
            clientId: client.id,
            platform: 'META_ADS',
            externalId: 'act_222',
            name: 'Conta Meta 2',
            vaultSecretPath: 'secret/clients/test/meta-ads/act_222',
          },
        ],
      })

      const service = new AdAccountsService(testDb)
      const result = await service.list(client.id)

      expect(result).toHaveLength(2)
      expect(result.map((a) => a.externalId)).toContain('act_111')
      expect(result.map((a) => a.externalId)).toContain('act_222')
    })

    it('não retorna contas de outro cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      await testDb.adAccount.create({
        data: {
          clientId: client1.id,
          platform: 'META_ADS',
          externalId: 'act_111',
          name: 'Conta do Cliente 1',
          vaultSecretPath: 'secret/clients/c1/meta-ads/act_111',
        },
      })

      const service = new AdAccountsService(testDb)
      const result = await service.list(client2.id)

      expect(result).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────
  // findById()
  // ─────────────────────────────────────────────

  describe('findById()', () => {
    it('retorna a conta quando existe e pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_999',
          name: 'Minha Conta',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_999',
        },
      })

      const service = new AdAccountsService(testDb)
      const result = await service.findById(account.id, client.id)

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Minha Conta')
    })

    it('retorna null quando conta não pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client1.id,
          platform: 'META_ADS',
          externalId: 'act_555',
          name: 'Conta do Cliente 1',
          vaultSecretPath: 'secret/clients/c1/meta-ads/act_555',
        },
      })

      const service = new AdAccountsService(testDb)
      const result = await service.findById(account.id, client2.id)

      expect(result).toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // create()
  // ─────────────────────────────────────────────

  describe('create()', () => {
    it('cria uma conta de anúncio com vaultSecretPath', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const service = new AdAccountsService(testDb)
      const result = await service.create(
        {
          platform: 'META_ADS',
          externalId: 'act_123456',
          name: 'XGO Ads',
          vaultSecretPath: 'secret/clients/abc/meta-ads/act_123456',
          currency: 'BRL',
          timezone: 'America/Sao_Paulo',
        },
        client.id,
        admin.id,
      )

      expect(result.clientId).toBe(client.id)
      expect(result.platform).toBe('META_ADS')
      expect(result.externalId).toBe('act_123456')
      // CRÍTICO: token NÃO deve estar no objeto retornado — apenas o path
      expect(result.vaultSecretPath).toBe('secret/clients/abc/meta-ads/act_123456')
      expect((result as Record<string, unknown>)['accessToken']).toBeUndefined()
    })

    it('registra AuditLog na criação', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const service = new AdAccountsService(testDb)
      const account = await service.create(
        {
          platform: 'META_ADS',
          externalId: 'act_audit',
          name: 'Audit Test',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_audit',
        },
        client.id,
        admin.id,
      )

      const log = await testDb.auditLog.findFirst({
        where: { action: 'adAccount.connect', resourceId: account.id },
      })

      expect(log).toBeTruthy()
      expect(log!.userId).toBe(admin.id)
    })

    it('lança erro quando conta já existe para mesma plataforma e externalId', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const service = new AdAccountsService(testDb)
      await service.create(
        {
          platform: 'META_ADS',
          externalId: 'act_dup',
          name: 'Primeira',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_dup',
        },
        client.id,
        admin.id,
      )

      await expect(
        service.create(
          {
            platform: 'META_ADS',
            externalId: 'act_dup',
            name: 'Duplicada',
            vaultSecretPath: 'secret/clients/test/meta-ads/act_dup',
          },
          client.id,
          admin.id,
        ),
      ).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // updateSyncStatus()
  // ─────────────────────────────────────────────

  describe('updateSyncStatus()', () => {
    it('atualiza o status de sincronização da conta', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_sync',
          name: 'Sync Test',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_sync',
        },
      })

      const service = new AdAccountsService(testDb)
      await service.updateSyncStatus(account.id, 'SYNCING')

      const updated = await testDb.adAccount.findUnique({ where: { id: account.id } })
      expect(updated!.syncStatus).toBe('SYNCING')
    })

    it('registra lastSyncAt e limpa syncError quando status é SUCCESS', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_success',
          name: 'Success Test',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_success',
          syncStatus: 'ERROR',
          syncError: 'Token expirado',
        },
      })

      const service = new AdAccountsService(testDb)
      await service.updateSyncStatus(account.id, 'SUCCESS')

      const updated = await testDb.adAccount.findUnique({ where: { id: account.id } })
      expect(updated!.syncStatus).toBe('SUCCESS')
      expect(updated!.lastSyncAt).not.toBeNull()
      expect(updated!.syncError).toBeNull()
    })

    it('registra mensagem de erro quando status é ERROR', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_err',
          name: 'Error Test',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_err',
        },
      })

      const service = new AdAccountsService(testDb)
      await service.updateSyncStatus(account.id, 'ERROR', 'Token inválido')

      const updated = await testDb.adAccount.findUnique({ where: { id: account.id } })
      expect(updated!.syncStatus).toBe('ERROR')
      expect(updated!.syncError).toBe('Token inválido')
    })
  })

  // ─────────────────────────────────────────────
  // delete()
  // ─────────────────────────────────────────────

  describe('delete()', () => {
    it('remove a conta de anúncio do banco', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_del',
          name: 'Deletar',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_del',
        },
      })

      const service = new AdAccountsService(testDb)
      await service.delete(account.id, client.id, admin.id)

      const inDb = await testDb.adAccount.findUnique({ where: { id: account.id } })
      expect(inDb).toBeNull()
    })

    it('registra AuditLog ao desconectar conta', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_audit_del',
          name: 'Audit Delete',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_audit_del',
        },
      })

      const service = new AdAccountsService(testDb)
      await service.delete(account.id, client.id, admin.id)

      const log = await testDb.auditLog.findFirst({
        where: { action: 'adAccount.disconnect', resourceId: account.id },
      })

      expect(log).toBeTruthy()
    })

    it('lança NotFoundError quando conta não pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client1.id,
          platform: 'META_ADS',
          externalId: 'act_other',
          name: 'Outra',
          vaultSecretPath: 'secret/clients/c1/meta-ads/act_other',
        },
      })

      const service = new AdAccountsService(testDb)

      await expect(service.delete(account.id, client2.id, admin.id)).rejects.toThrow(
        'Conta de anúncio não encontrada',
      )
    })
  })
})
