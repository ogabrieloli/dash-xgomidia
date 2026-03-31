/**
 * Testes do guard de isolamento de dados por cliente.
 * Usa banco real (docker).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { assertClientAccess } from './client-access.guard.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

describe('assertClientAccess()', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  describe('AGENCY_ADMIN', () => {
    it('permite acesso a qualquer cliente da agência sem verificação adicional', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })
      const client = await createTestClient(agency.id)

      // Não deve lançar
      await expect(
        assertClientAccess(admin.id, 'AGENCY_ADMIN', client.id, testDb),
      ).resolves.not.toThrow()
    })
  })

  describe('AGENCY_MANAGER', () => {
    it('permite acesso quando o cliente pertence à agência do manager', async () => {
      const agency = await createTestAgency()
      const manager = await createTestUser(agency.id, { role: 'AGENCY_MANAGER' })
      const client = await createTestClient(agency.id)

      await expect(
        assertClientAccess(manager.id, 'AGENCY_MANAGER', client.id, testDb),
      ).resolves.not.toThrow()
    })

    it('nega acesso quando o cliente pertence a outra agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()
      const manager = await createTestUser(agency1.id, { role: 'AGENCY_MANAGER' })
      const clientOfAgency2 = await createTestClient(agency2.id)

      await expect(
        assertClientAccess(manager.id, 'AGENCY_MANAGER', clientOfAgency2.id, testDb),
      ).rejects.toThrow('Acesso negado a este cliente')
    })

    it('nega acesso a cliente soft-deleted', async () => {
      const agency = await createTestAgency()
      const manager = await createTestUser(agency.id, { role: 'AGENCY_MANAGER' })
      const client = await createTestClient(agency.id)

      // Soft delete o cliente
      await testDb.client.update({
        where: { id: client.id },
        data: { deletedAt: new Date() },
      })

      await expect(
        assertClientAccess(manager.id, 'AGENCY_MANAGER', client.id, testDb),
      ).rejects.toThrow('Acesso negado a este cliente')
    })
  })

  describe('CLIENT_VIEWER', () => {
    it('permite acesso quando há ClientUserAccess explícito', async () => {
      const agency = await createTestAgency()
      const viewer = await createTestUser(agency.id, { role: 'CLIENT_VIEWER' })
      const client = await createTestClient(agency.id)

      // Criar acesso explícito
      await testDb.clientUserAccess.create({
        data: { clientId: client.id, userId: viewer.id },
      })

      await expect(
        assertClientAccess(viewer.id, 'CLIENT_VIEWER', client.id, testDb),
      ).resolves.not.toThrow()
    })

    it('nega acesso quando não há ClientUserAccess', async () => {
      const agency = await createTestAgency()
      const viewer = await createTestUser(agency.id, { role: 'CLIENT_VIEWER' })
      const client = await createTestClient(agency.id)

      // Sem criar acesso explícito
      await expect(
        assertClientAccess(viewer.id, 'CLIENT_VIEWER', client.id, testDb),
      ).rejects.toThrow('Acesso negado a este cliente')
    })

    it('não permite CLIENT_VIEWER acessar cliente de outro sem acesso explícito', async () => {
      const agency = await createTestAgency()
      const viewer = await createTestUser(agency.id, { role: 'CLIENT_VIEWER' })
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      // Acesso apenas ao client1
      await testDb.clientUserAccess.create({
        data: { clientId: client1.id, userId: viewer.id },
      })

      await expect(
        assertClientAccess(viewer.id, 'CLIENT_VIEWER', client2.id, testDb),
      ).rejects.toThrow('Acesso negado a este cliente')
    })
  })
})
