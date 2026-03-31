/**
 * Testes do ClientsService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ClientsService } from './clients.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

describe('ClientsService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // list()
  // ─────────────────────────────────────────────

  describe('list()', () => {
    it('retorna todos os clientes ativos da agência', async () => {
      const agency = await createTestAgency()
      await createTestClient(agency.id, { name: 'Cliente A' })
      await createTestClient(agency.id, { name: 'Cliente B' })

      const service = new ClientsService(testDb)
      const result = await service.list(agency.id)

      expect(result).toHaveLength(2)
      expect(result.map((c) => c.name)).toContain('Cliente A')
      expect(result.map((c) => c.name)).toContain('Cliente B')
    })

    it('não retorna clientes soft-deleted', async () => {
      const agency = await createTestAgency()
      const active = await createTestClient(agency.id, { name: 'Ativo' })
      const deleted = await createTestClient(agency.id, { name: 'Deletado' })

      await testDb.client.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      })

      const service = new ClientsService(testDb)
      const result = await service.list(agency.id)

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe(active.id)
    })

    it('não retorna clientes de outra agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()
      await createTestClient(agency1.id, { name: 'Da Agência 1' })
      await createTestClient(agency2.id, { name: 'Da Agência 2' })

      const service = new ClientsService(testDb)
      const result = await service.list(agency1.id)

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('Da Agência 1')
    })

    it('filtra por nome quando search é fornecido', async () => {
      const agency = await createTestAgency()
      await createTestClient(agency.id, { name: 'Empresa ABC' })
      await createTestClient(agency.id, { name: 'Empresa XYZ' })
      await createTestClient(agency.id, { name: 'Outro Nome' })

      const service = new ClientsService(testDb)
      const result = await service.list(agency.id, { search: 'Empresa' })

      expect(result).toHaveLength(2)
    })
  })

  // ─────────────────────────────────────────────
  // findById()
  // ─────────────────────────────────────────────

  describe('findById()', () => {
    it('retorna o cliente quando existe e pertence à agência', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id, { name: 'Meu Cliente' })

      const service = new ClientsService(testDb)
      const result = await service.findById(client.id, agency.id)

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Meu Cliente')
    })

    it('retorna null quando cliente não existe', async () => {
      const agency = await createTestAgency()

      const service = new ClientsService(testDb)
      const result = await service.findById('id-inexistente', agency.id)

      expect(result).toBeNull()
    })

    it('retorna null quando cliente pertence a outra agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()
      const clientOfAgency2 = await createTestClient(agency2.id)

      const service = new ClientsService(testDb)
      const result = await service.findById(clientOfAgency2.id, agency1.id)

      expect(result).toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // create()
  // ─────────────────────────────────────────────

  describe('create()', () => {
    it('cria um cliente com os dados corretos', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })

      const service = new ClientsService(testDb)
      const result = await service.create(
        { name: 'Novo Cliente', slug: 'novo-cliente' },
        agency.id,
        admin.id,
      )

      expect(result.name).toBe('Novo Cliente')
      expect(result.slug).toBe('novo-cliente')
      expect(result.agencyId).toBe(agency.id)
    })

    it('registra AuditLog na criação', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })

      const service = new ClientsService(testDb)
      const client = await service.create(
        { name: 'Audit Cliente', slug: 'audit-cliente' },
        agency.id,
        admin.id,
      )

      const log = await testDb.auditLog.findFirst({
        where: { action: 'client.create', resourceId: client.id },
      })

      expect(log).toBeTruthy()
      expect(log!.userId).toBe(admin.id)
    })

    it('lança erro quando slug já existe', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)

      await createTestClient(agency.id, { slug: 'slug-existente' })

      const service = new ClientsService(testDb)

      await expect(
        service.create({ name: 'Outro', slug: 'slug-existente' }, agency.id, admin.id),
      ).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // update()
  // ─────────────────────────────────────────────

  describe('update()', () => {
    it('atualiza os dados do cliente', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id, { name: 'Nome Antigo' })

      const service = new ClientsService(testDb)
      const result = await service.update(client.id, { name: 'Nome Novo' }, agency.id, admin.id)

      expect(result.name).toBe('Nome Novo')
    })

    it('registra AuditLog na atualização com before/after', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id, { name: 'Antes' })

      const service = new ClientsService(testDb)
      await service.update(client.id, { name: 'Depois' }, agency.id, admin.id)

      const log = await testDb.auditLog.findFirst({
        where: { action: 'client.update', resourceId: client.id },
      })

      expect(log).toBeTruthy()
      expect((log!.before as Record<string, unknown>)?.name).toBe('Antes')
      expect((log!.after as Record<string, unknown>)?.name).toBe('Depois')
    })

    it('lança NotFoundError quando cliente não pertence à agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()
      const admin = await createTestUser(agency1.id)
      const clientOfAgency2 = await createTestClient(agency2.id)

      const service = new ClientsService(testDb)

      await expect(
        service.update(clientOfAgency2.id, { name: 'Hack' }, agency1.id, admin.id),
      ).rejects.toThrow('Cliente não encontrado')
    })
  })

  // ─────────────────────────────────────────────
  // softDelete()
  // ─────────────────────────────────────────────

  describe('softDelete()', () => {
    it('define deletedAt no cliente sem removê-lo do banco', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      const service = new ClientsService(testDb)
      await service.softDelete(client.id, agency.id, admin.id)

      const inDb = await testDb.client.findUnique({ where: { id: client.id } })
      expect(inDb).not.toBeNull()
      expect(inDb!.deletedAt).not.toBeNull()
    })

    it('registra AuditLog na exclusão', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      const service = new ClientsService(testDb)
      await service.softDelete(client.id, agency.id, admin.id)

      const log = await testDb.auditLog.findFirst({
        where: { action: 'client.delete', resourceId: client.id },
      })

      expect(log).toBeTruthy()
    })

    it('lança NotFoundError quando cliente não pertence à agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()
      const admin = await createTestUser(agency1.id)
      const clientOfAgency2 = await createTestClient(agency2.id)

      const service = new ClientsService(testDb)

      await expect(
        service.softDelete(clientOfAgency2.id, agency1.id, admin.id),
      ).rejects.toThrow('Cliente não encontrado')
    })
  })
})
