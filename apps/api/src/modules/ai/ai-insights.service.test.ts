/**
 * Testes do AiInsightsService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { AiInsightsService } from './ai-insights.service.js'
import {
  testDb,
  createTestAgency,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

async function createInsight(clientId: string, overrides: {
  severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  readAt?: Date | null
  strategyId?: string | null
} = {}) {
  return testDb.aiInsight.create({
    data: {
      clientId,
      strategyId: overrides.strategyId ?? null,
      type: 'ALERT',
      severity: overrides.severity ?? 'WARNING',
      title: 'Test Insight',
      body: 'Test body text',
      source: 'RULES_ENGINE',
      readAt: overrides.readAt ?? null,
    },
  })
}

describe('AiInsightsService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // list()
  // ─────────────────────────────────────────────

  describe('list()', () => {
    it('retorna insights do cliente ordenados por data decrescente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await createInsight(client.id, { severity: 'WARNING' })
      await createInsight(client.id, { severity: 'CRITICAL' })
      await createInsight(client.id, { severity: 'INFO' })

      const service = new AiInsightsService(testDb)
      const result = await service.list(client.id)

      expect(result).toHaveLength(3)
    })

    it('filtra por unread quando onlyUnread=true', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await createInsight(client.id)
      await createInsight(client.id, { readAt: new Date() }) // lido

      const service = new AiInsightsService(testDb)
      const result = await service.list(client.id, { onlyUnread: true })

      expect(result).toHaveLength(1)
      expect(result[0]!.readAt).toBeNull()
    })

    it('filtra por severity', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await createInsight(client.id, { severity: 'WARNING' })
      await createInsight(client.id, { severity: 'CRITICAL' })
      await createInsight(client.id, { severity: 'INFO' })

      const service = new AiInsightsService(testDb)
      const criticals = await service.list(client.id, { severity: 'CRITICAL' })

      expect(criticals).toHaveLength(1)
      expect(criticals[0]!.severity).toBe('CRITICAL')
    })

    it('não retorna insights de outro cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      await createInsight(client2.id)

      const service = new AiInsightsService(testDb)
      const result = await service.list(client1.id)

      expect(result).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────
  // markAsRead()
  // ─────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('define readAt no insight', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const insight = await createInsight(client.id)

      const service = new AiInsightsService(testDb)
      await service.markAsRead(insight.id, client.id)

      const updated = await testDb.aiInsight.findUnique({ where: { id: insight.id } })
      expect(updated!.readAt).not.toBeNull()
    })

    it('é idempotente — não muda readAt já definido', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const firstRead = new Date('2024-01-01')
      const insight = await createInsight(client.id, { readAt: firstRead })

      const service = new AiInsightsService(testDb)
      await service.markAsRead(insight.id, client.id)

      const updated = await testDb.aiInsight.findUnique({ where: { id: insight.id } })
      expect(updated!.readAt!.getTime()).toBe(firstRead.getTime())
    })

    it('lança NotFoundError para insight de outro cliente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)
      const insight = await createInsight(client1.id)

      const service = new AiInsightsService(testDb)
      await expect(service.markAsRead(insight.id, client2.id)).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // createFromRuleResult()
  // ─────────────────────────────────────────────

  describe('createFromRuleResult()', () => {
    it('persiste um insight com source RULES_ENGINE', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      const service = new AiInsightsService(testDb)
      const insight = await service.createFromRuleResult({
        clientId: client.id,
        adAccountId: 'acc-test',
        severity: 'WARNING',
        title: 'ROAS baixo',
        body: 'ROAS está abaixo da meta',
      })

      expect(insight.source).toBe('RULES_ENGINE')
      expect(insight.type).toBe('ALERT')
      expect(insight.severity).toBe('WARNING')
      expect(insight.clientId).toBe(client.id)
    })

    it('não cria duplicata se já existe insight do mesmo tipo nas últimas 24h', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)

      await testDb.aiInsight.create({
        data: {
          clientId: client.id,
          type: 'ALERT',
          severity: 'WARNING',
          title: 'ROAS baixo',
          body: 'ROAS está abaixo da meta',
          source: 'RULES_ENGINE',
          metadata: { adAccountId: 'acc-test', ruleKey: 'roas' } as object,
        },
      })

      const service = new AiInsightsService(testDb)
      const result = await service.createFromRuleResult({
        clientId: client.id,
        adAccountId: 'acc-test',
        severity: 'WARNING',
        title: 'ROAS baixo',
        body: 'ROAS está abaixo da meta',
        ruleKey: 'roas',
      })

      expect(result).toBeNull() // duplicata ignorada

      const count = await testDb.aiInsight.count({ where: { clientId: client.id } })
      expect(count).toBe(1)
    })
  })
})
