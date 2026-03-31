/**
 * Testes do MetricsService.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import { MetricsService } from './metrics.service.js'
import {
  testDb,
  createTestAgency,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

// Helper para criar MetricSnapshot diretamente
async function createMetricSnapshot(data: {
  adAccountId: string
  date: string
  impressions?: number
  clicks?: number
  spend?: number
  conversions?: number
  revenue?: number
}) {
  return testDb.metricSnapshot.create({
    data: {
      adAccountId: data.adAccountId,
      date: new Date(data.date),
      platform: 'META_ADS',
      impressions: BigInt(data.impressions ?? 1000),
      clicks: BigInt(data.clicks ?? 50),
      spend: new Decimal(data.spend ?? 100),
      conversions: data.conversions ?? 5,
      revenue: data.revenue !== undefined ? new Decimal(data.revenue) : null,
    },
  })
}

async function createAdAccount(clientId: string, externalId = 'act_test') {
  return testDb.adAccount.create({
    data: {
      clientId,
      platform: 'META_ADS',
      externalId,
      name: 'Test Account',
      vaultSecretPath: `secret/clients/test/meta-ads/${externalId}`,
    },
  })
}

describe('MetricsService', () => {
  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // getByAdAccount()
  // ─────────────────────────────────────────────

  describe('getByAdAccount()', () => {
    it('retorna métricas diárias com derivadas calculadas', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const account = await createAdAccount(client.id)

      await createMetricSnapshot({
        adAccountId: account.id,
        date: '2024-06-01',
        impressions: 10000,
        clicks: 200,
        spend: 500,
        conversions: 20,
        revenue: 2000,
      })

      const service = new MetricsService(testDb)
      const result = await service.getByAdAccount(account.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(result.rows).toHaveLength(1)
      const row = result.rows[0]!

      expect(row.impressions).toBe(10000)
      expect(row.clicks).toBe(200)
      expect(Number(row.spend)).toBe(500)
      expect(row.conversions).toBe(20)

      // Métricas derivadas
      expect(row.derived.ctr).toBeCloseTo(2.0)      // 200/10000 * 100
      expect(row.derived.cpc).toBeCloseTo(2.5)      // 500/200
      expect(row.derived.cpa).toBeCloseTo(25)       // 500/20
      expect(row.derived.roas).toBeCloseTo(4.0)     // 2000/500
      expect(row.derived.cpm).toBeCloseTo(50)       // 500/10000 * 1000
    })

    it('retorna apenas métricas dentro do intervalo de datas', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const account = await createAdAccount(client.id)

      await createMetricSnapshot({ adAccountId: account.id, date: '2024-06-01' })
      await createMetricSnapshot({ adAccountId: account.id, date: '2024-06-15' })
      await createMetricSnapshot({ adAccountId: account.id, date: '2024-07-01' }) // fora

      const service = new MetricsService(testDb)
      const result = await service.getByAdAccount(account.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(result.rows).toHaveLength(2)
    })

    it('calcula totais agregados corretamente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const account = await createAdAccount(client.id)

      await createMetricSnapshot({ adAccountId: account.id, date: '2024-06-01', spend: 300, clicks: 100, conversions: 10, revenue: 1000 })
      await createMetricSnapshot({ adAccountId: account.id, date: '2024-06-02', spend: 200, clicks: 80, conversions: 8, revenue: 800 })

      const service = new MetricsService(testDb)
      const result = await service.getByAdAccount(account.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(Number(result.totals.spend)).toBeCloseTo(500)
      expect(result.totals.clicks).toBe(180)
      expect(result.totals.conversions).toBe(18)
      expect(Number(result.totals.revenue)).toBeCloseTo(1800)
    })

    it('retorna lista vazia quando não há métricas no período', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const account = await createAdAccount(client.id)

      const service = new MetricsService(testDb)
      const result = await service.getByAdAccount(account.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(result.rows).toHaveLength(0)
      expect(Number(result.totals.spend)).toBe(0)
    })
  })

  // ─────────────────────────────────────────────
  // getClientSummary()
  // ─────────────────────────────────────────────

  describe('getClientSummary()', () => {
    it('agrega métricas de todas as contas do cliente', async () => {
      const agency = await createTestAgency()
      const client = await createTestClient(agency.id)
      const account1 = await createAdAccount(client.id, 'act_001')
      const account2 = await createAdAccount(client.id, 'act_002')

      await createMetricSnapshot({ adAccountId: account1.id, date: '2024-06-01', spend: 300, clicks: 100 })
      await createMetricSnapshot({ adAccountId: account2.id, date: '2024-06-01', spend: 200, clicks: 80 })

      const service = new MetricsService(testDb)
      const result = await service.getClientSummary(client.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(Number(result.totals.spend)).toBeCloseTo(500)
      expect(result.totals.clicks).toBe(180)
    })

    it('não mistura dados de outros clientes', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      const account1 = await createAdAccount(client1.id, 'act_c1')
      const account2 = await createAdAccount(client2.id, 'act_c2')

      await createMetricSnapshot({ adAccountId: account1.id, date: '2024-06-01', spend: 500 })
      await createMetricSnapshot({ adAccountId: account2.id, date: '2024-06-01', spend: 9999 })

      const service = new MetricsService(testDb)
      const result = await service.getClientSummary(client1.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(Number(result.totals.spend)).toBeCloseTo(500)
    })
  })

  // ─────────────────────────────────────────────
  // getAgencySummary()
  // ─────────────────────────────────────────────

  describe('getAgencySummary()', () => {
    it('retorna sumário com totais de toda a agência', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id)
      const client2 = await createTestClient(agency.id)

      const account1 = await createAdAccount(client1.id, 'act_a1')
      const account2 = await createAdAccount(client2.id, 'act_a2')

      await createMetricSnapshot({ adAccountId: account1.id, date: '2024-06-01', spend: 1000, revenue: 4000 })
      await createMetricSnapshot({ adAccountId: account2.id, date: '2024-06-01', spend: 2000, revenue: 6000 })

      const service = new MetricsService(testDb)
      const result = await service.getAgencySummary(agency.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(Number(result.totals.spend)).toBeCloseTo(3000)
      expect(Number(result.totals.revenue)).toBeCloseTo(10000)
      expect(result.totals.derived.roas).toBeCloseTo(10000 / 3000)
    })

    it('retorna topClients ordenados por spend decrescente', async () => {
      const agency = await createTestAgency()
      const client1 = await createTestClient(agency.id, { name: 'Cliente Menor' })
      const client2 = await createTestClient(agency.id, { name: 'Cliente Maior' })

      const account1 = await createAdAccount(client1.id, 'act_menor')
      const account2 = await createAdAccount(client2.id, 'act_maior')

      await createMetricSnapshot({ adAccountId: account1.id, date: '2024-06-01', spend: 500 })
      await createMetricSnapshot({ adAccountId: account2.id, date: '2024-06-01', spend: 2000 })

      const service = new MetricsService(testDb)
      const result = await service.getAgencySummary(agency.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(result.topClients[0]!.clientName).toBe('Cliente Maior')
      expect(result.topClients[1]!.clientName).toBe('Cliente Menor')
    })

    it('não retorna dados de outra agência', async () => {
      const agency1 = await createTestAgency()
      const agency2 = await createTestAgency()

      const client1 = await createTestClient(agency1.id)
      const client2 = await createTestClient(agency2.id)

      const account1 = await createAdAccount(client1.id, 'act_ag1')
      const account2 = await createAdAccount(client2.id, 'act_ag2')

      await createMetricSnapshot({ adAccountId: account1.id, date: '2024-06-01', spend: 1000 })
      await createMetricSnapshot({ adAccountId: account2.id, date: '2024-06-01', spend: 9999 })

      const service = new MetricsService(testDb)
      const result = await service.getAgencySummary(agency1.id, {
        from: '2024-06-01',
        to: '2024-06-30',
      })

      expect(Number(result.totals.spend)).toBeCloseTo(1000)
    })
  })
})
