import { describe, it, expect, afterEach } from 'vitest'
import { ProjectsService } from './projects.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

describe('ProjectsService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  describe('list()', () => {
    it('retorna projetos ativos do cliente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await testDb.project.createMany({
        data: [
          { clientId: client.id, name: 'Projeto A' },
          { clientId: client.id, name: 'Projeto B' },
        ],
      })

      const service = new ProjectsService(testDb)
      const result = await service.list(client.id)

      expect(result).toHaveLength(2)
    })

    it('não retorna projetos soft-deleted', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const p = await testDb.project.create({ data: { clientId: client.id, name: 'Deletado' } })
      await testDb.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } })

      const service = new ProjectsService(testDb)
      const result = await service.list(client.id)

      expect(result).toHaveLength(0)
    })

    it('não retorna projetos de outro cliente', async () => {
      const agency = await createTestAgency()
      const c1 = await createTestClient(agency.id)
      const c2 = await createTestClient(agency.id)
      await testDb.project.create({ data: { clientId: c1.id, name: 'Do C1' } })
      await testDb.project.create({ data: { clientId: c2.id, name: 'Do C2' } })

      const service = new ProjectsService(testDb)
      const result = await service.list(c1.id)

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('Do C1')
    })
  })

  describe('create()', () => {
    it('cria projeto com dados corretos', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const service = new ProjectsService(testDb)
      const result = await service.create(
        { name: 'Novo Projeto', description: 'Desc' },
        client.id,
        admin.id,
      )

      expect(result.name).toBe('Novo Projeto')
      expect(result.clientId).toBe(client.id)
    })

    it('registra AuditLog na criação', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)

      const service = new ProjectsService(testDb)
      const project = await service.create({ name: 'Audit' }, client.id, admin.id)

      const log = await testDb.auditLog.findFirst({
        where: { action: 'project.create', resourceId: project.id },
      })
      expect(log).toBeTruthy()
    })
  })

  describe('update()', () => {
    it('atualiza nome e descrição do projeto', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)
      const project = await testDb.project.create({
        data: { clientId: client.id, name: 'Antigo' },
      })

      const service = new ProjectsService(testDb)
      const result = await service.update(
        project.id,
        { name: 'Novo', description: 'Nova desc' },
        client.id,
        admin.id,
      )

      expect(result.name).toBe('Novo')
      expect(result.description).toBe('Nova desc')
    })

    it('lança NotFoundError quando projeto não pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const c1 = await createTestClient(agency.id)
      const c2 = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)
      const projectOfC2 = await testDb.project.create({
        data: { clientId: c2.id, name: 'Proj C2' },
      })

      const service = new ProjectsService(testDb)
      await expect(
        service.update(projectOfC2.id, { name: 'Hack' }, c1.id, admin.id),
      ).rejects.toThrow('Projeto não encontrado')
    })
  })

  describe('softDelete()', () => {
    it('soft-deleta o projeto', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const admin = await createTestUser(agency.id)
      const project = await testDb.project.create({
        data: { clientId: client.id, name: 'Para deletar' },
      })

      const service = new ProjectsService(testDb)
      await service.softDelete(project.id, client.id, admin.id)

      const inDb = await testDb.project.findUnique({ where: { id: project.id } })
      expect(inDb!.deletedAt).not.toBeNull()
    })
  })
})
