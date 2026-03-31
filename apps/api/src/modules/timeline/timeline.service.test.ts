/**
 * Testes do TimelineService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { TimelineService } from './timeline.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

describe('TimelineService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // list()
  // ─────────────────────────────────────────────

  describe('list()', () => {
    it('retorna entradas do cliente ordenadas por occurredAt desc', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      await testDb.timelineEntry.createMany({
        data: [
          {
            clientId: client.id,
            authorId: user.id,
            type: 'NOTE',
            title: 'Nota 1',
            body: 'Conteúdo 1',
            occurredAt: new Date('2024-06-01'),
          },
          {
            clientId: client.id,
            authorId: user.id,
            type: 'ACTION',
            title: 'Ação 2',
            body: 'Conteúdo 2',
            occurredAt: new Date('2024-06-15'),
          },
        ],
      })

      const service = new TimelineService(testDb)
      const result = await service.list(client.id)

      expect(result).toHaveLength(2)
      expect(result[0]!.occurredAt > result[1]!.occurredAt).toBe(true)
    })

    it('não retorna entradas de outro cliente', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      await testDb.timelineEntry.create({
        data: {
          clientId: client2.id,
          authorId: user.id,
          type: 'NOTE',
          title: 'Do cliente 2',
          body: 'Privado',
          occurredAt: new Date(),
        },
      })

      const service = new TimelineService(testDb)
      const result = await service.list(client1.id)

      expect(result).toHaveLength(0)
    })

    it('filtra por tipo quando fornecido', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      await testDb.timelineEntry.createMany({
        data: [
          { clientId: client.id, authorId: user.id, type: 'NOTE', title: 'Nota', body: '', occurredAt: new Date() },
          { clientId: client.id, authorId: user.id, type: 'ALERT', title: 'Alerta', body: '', occurredAt: new Date() },
          { clientId: client.id, authorId: user.id, type: 'ACTION', title: 'Ação', body: '', occurredAt: new Date() },
        ],
      })

      const service = new TimelineService(testDb)
      const notes = await service.list(client.id, { type: 'NOTE' })

      expect(notes).toHaveLength(1)
      expect(notes[0]!.type).toBe('NOTE')
    })
  })

  // ─────────────────────────────────────────────
  // create()
  // ─────────────────────────────────────────────

  describe('create()', () => {
    it('cria uma entrada no timeline', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      const service = new TimelineService(testDb)
      const entry = await service.create(
        {
          type: 'OPTIMIZATION',
          title: 'Ajuste de lance',
          body: 'Aumentei o CPC máximo de R$2 para R$3 no conjunto X',
          occurredAt: new Date('2024-06-10'),
        },
        client.id,
        user.id,
      )

      expect(entry.type).toBe('OPTIMIZATION')
      expect(entry.title).toBe('Ajuste de lance')
      expect(entry.clientId).toBe(client.id)
      expect(entry.authorId).toBe(user.id)
    })
  })

  // ─────────────────────────────────────────────
  // delete()
  // ─────────────────────────────────────────────

  describe('delete()', () => {
    it('remove a entrada do banco', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)

      const entry = await testDb.timelineEntry.create({
        data: {
          clientId: client.id,
          authorId: user.id,
          type: 'NOTE',
          title: 'Para deletar',
          body: '',
          occurredAt: new Date(),
        },
      })

      const service = new TimelineService(testDb)
      await service.delete(entry.id, client.id, user.id)

      const inDb = await testDb.timelineEntry.findUnique({ where: { id: entry.id } })
      expect(inDb).toBeNull()
    })

    it('lança NotFoundError quando a entrada não pertence ao cliente', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id)
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      const entry = await testDb.timelineEntry.create({
        data: {
          clientId: client1.id,
          authorId: user.id,
          type: 'NOTE',
          title: 'Privado',
          body: '',
          occurredAt: new Date(),
        },
      })

      const service = new TimelineService(testDb)
      await expect(service.delete(entry.id, client2.id, user.id)).rejects.toThrow()
    })
  })
})
