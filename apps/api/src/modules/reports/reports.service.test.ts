/**
 * Testes do ReportsService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { ReportsService } from './reports.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'
import type { Queue } from 'bullmq'

// Queue mock: apenas verifica se add() é chamado (BullMQ requer Redis real para testes funcionais)
function makeQueueMock() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-123' }) } as unknown as Queue
}

describe('ReportsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // create()
  // ─────────────────────────────────────────────

  describe('create()', () => {
    it('cria relatório com status PENDING e enfileira job', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()

      const service = new ReportsService(testDb, queue)
      const report = await service.create({
        clientId: client.id,
        title: 'Relatório Junho 2024',
        type: 'PDF',
        config: { dateRange: { from: '2024-06-01', to: '2024-06-30' } },
      })

      expect(report.status).toBe('PENDING')
      expect(report.type).toBe('PDF')
      expect(report.clientId).toBe(client.id)
      expect(report.storageKey).toBeNull()
      expect(queue.add).toHaveBeenCalledOnce()

      const callArgs = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(callArgs[0]).toBe('render')
      expect(callArgs[1]).toMatchObject({ reportId: report.id, clientId: client.id, type: 'PDF' })
    })

    it('cria relatório PPT corretamente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()

      const service = new ReportsService(testDb, queue)
      const report = await service.create({
        clientId: client.id,
        title: 'Apresentação Q2',
        type: 'PPT',
        config: {},
      })

      expect(report.type).toBe('PPT')
      expect(report.status).toBe('PENDING')
    })
  })

  // ─────────────────────────────────────────────
  // list()
  // ─────────────────────────────────────────────

  describe('list()', () => {
    it('retorna relatórios do cliente ordenados por createdAt desc', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      await service.create({ clientId: client.id, title: 'Rel 1', type: 'PDF', config: {} })
      await service.create({ clientId: client.id, title: 'Rel 2', type: 'PPT', config: {} })

      const reports = await service.list(client.id)

      expect(reports).toHaveLength(2)
      // Mais recente primeiro
      expect(reports[0]!.createdAt >= reports[1]!.createdAt).toBe(true)
    })

    it('não retorna relatórios de outro cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      await service.create({ clientId: client2.id, title: 'Rel do cliente 2', type: 'PDF', config: {} })

      const reports = await service.list(client1.id)
      expect(reports).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────
  // findById()
  // ─────────────────────────────────────────────

  describe('findById()', () => {
    it('retorna o relatório quando pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      const created = await service.create({
        clientId: client.id,
        title: 'Rel Teste',
        type: 'PDF',
        config: {},
      })

      const found = await service.findById(created.id, client.id)
      expect(found.id).toBe(created.id)
    })

    it('lança NotFoundError quando relatório não existe', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      await expect(
        service.findById('00000000-0000-0000-0000-000000000000', client.id),
      ).rejects.toThrow()
    })

    it('lança NotFoundError quando relatório pertence a outro cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      const report = await service.create({
        clientId: client1.id,
        title: 'Privado',
        type: 'PDF',
        config: {},
      })

      await expect(service.findById(report.id, client2.id)).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // updateStatus()
  // ─────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('atualiza status para DONE e registra storageKey e generatedAt', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      const report = await service.create({
        clientId: client.id,
        title: 'Rel Final',
        type: 'PDF',
        config: {},
      })

      const updated = await service.updateStatus(report.id, 'DONE', {
        storageKey: `reports/${client.id}/${report.id}.pdf`,
      })

      expect(updated.status).toBe('DONE')
      expect(updated.storageKey).toBe(`reports/${client.id}/${report.id}.pdf`)
      expect(updated.generatedAt).not.toBeNull()
    })

    it('atualiza status para ERROR e registra errorMessage', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const queue = makeQueueMock()
      const service = new ReportsService(testDb, queue)

      const report = await service.create({
        clientId: client.id,
        title: 'Rel Falhou',
        type: 'PDF',
        config: {},
      })

      const updated = await service.updateStatus(report.id, 'ERROR', {
        errorMessage: 'Puppeteer timeout',
      })

      expect(updated.status).toBe('ERROR')
      expect(updated.errorMessage).toBe('Puppeteer timeout')
    })
  })
})
