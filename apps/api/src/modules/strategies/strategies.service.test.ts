import { describe, it, expect, afterEach } from 'vitest'
import { StrategiesService } from './strategies.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

async function createTestProject(clientId: string, name = 'Projeto Teste') {
  return testDb.project.create({ data: { clientId, name } })
}

describe('StrategiesService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  describe('list()', () => {
    it('retorna estratégias ativas do projeto', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)

      await testDb.strategy.createMany({
        data: [
          { projectId: project.id, name: 'Webinar Q1', funnelType: 'WEBINAR', metricConfig: {} },
          { projectId: project.id, name: 'Venda Direta', funnelType: 'DIRECT_SALE', metricConfig: {} },
        ],
      })

      const service = new StrategiesService(testDb)
      const result = await service.list(project.id)

      expect(result).toHaveLength(2)
    })

    it('não retorna estratégias soft-deleted', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)
      const s = await testDb.strategy.create({
        data: { projectId: project.id, name: 'Deletada', funnelType: 'WEBINAR', metricConfig: {} },
      })
      await testDb.strategy.update({ where: { id: s.id }, data: { deletedAt: new Date() } })

      const service = new StrategiesService(testDb)
      const result = await service.list(project.id)

      expect(result).toHaveLength(0)
    })
  })

  describe('create()', () => {
    it('cria estratégia com funnelType e metricConfig', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)
      const admin = await createTestUser(agency.id)

      const service = new StrategiesService(testDb)
      const result = await service.create(
        {
          name: 'Webinar de Vendas',
          funnelType: 'WEBINAR',
          metricConfig: { goalRoas: 3.0, maxCpa: 80, visibleMetrics: ['spend', 'roas'] },
        },
        project.id,
        admin.id,
      )

      expect(result.name).toBe('Webinar de Vendas')
      expect(result.funnelType).toBe('WEBINAR')
      expect(result.metricConfig).toMatchObject({ goalRoas: 3.0 })
    })

    it('registra AuditLog na criação', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)
      const admin = await createTestUser(agency.id)

      const service = new StrategiesService(testDb)
      const strategy = await service.create(
        { name: 'Audit', funnelType: 'CUSTOM', metricConfig: {} },
        project.id,
        admin.id,
      )

      const log = await testDb.auditLog.findFirst({
        where: { action: 'strategy.create', resourceId: strategy.id },
      })
      expect(log).toBeTruthy()
    })
  })

  describe('updateMetricConfig()', () => {
    it('atualiza metricConfig sem sobrescrever funnelType', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)
      const admin = await createTestUser(agency.id)
      const strategy = await testDb.strategy.create({
        data: {
          projectId: project.id,
          name: 'Strat',
          funnelType: 'WEBINAR',
          metricConfig: { goalRoas: 2.0 },
        },
      })

      const service = new StrategiesService(testDb)
      const result = await service.updateMetricConfig(strategy.id, { goalRoas: 4.0, maxCpa: 50 }, admin.id)

      expect((result.metricConfig as Record<string, unknown>).goalRoas).toBe(4.0)
      expect(result.funnelType).toBe('WEBINAR')
    })
  })

  describe('softDelete()', () => {
    it('soft-deleta a estratégia', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const project = await createTestProject(client.id)
      const admin = await createTestUser(agency.id)
      const strategy = await testDb.strategy.create({
        data: { projectId: project.id, name: 'Para deletar', funnelType: 'CUSTOM', metricConfig: {} },
      })

      const service = new StrategiesService(testDb)
      await service.softDelete(strategy.id, project.id, admin.id)

      const inDb = await testDb.strategy.findUnique({ where: { id: strategy.id } })
      expect(inDb!.deletedAt).not.toBeNull()
    })

    it('lança NotFoundError quando estratégia não pertence ao projeto', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const p1 = await createTestProject(client.id, 'P1')
      const p2 = await createTestProject(client.id, 'P2')
      const admin = await createTestUser(agency.id)
      const stratOfP2 = await testDb.strategy.create({
        data: { projectId: p2.id, name: 'S', funnelType: 'CUSTOM', metricConfig: {} },
      })

      const service = new StrategiesService(testDb)
      await expect(
        service.softDelete(stratOfP2.id, p1.id, admin.id),
      ).rejects.toThrow('Estratégia não encontrada')
    })
  })
})
