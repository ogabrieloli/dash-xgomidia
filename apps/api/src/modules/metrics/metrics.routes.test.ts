/**
 * Testes de integração das rotas de métricas.
 * Banco real (docker) — sem mocks.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaClient } from '@prisma/client'
import { metricsRoutes } from './metrics.routes.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

function signToken(sub: string, agencyId: string, role = 'AGENCY_ADMIN') {
  return jwt.sign(
    { sub, email: 'test@test.com', role, agencyId },
    process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long',
    { expiresIn: '15m' },
  )
}

async function createAdAccount(clientId: string, externalId = 'act_test') {
  return testDb.adAccount.create({
    data: {
      clientId,
      platform: 'META_ADS',
      externalId,
      name: 'Test Account',
      vaultSecretPath: `secret/test/meta-ads/${externalId}`,
    },
  })
}

async function createSnapshot(adAccountId: string, date: string, spend = 100) {
  return testDb.metricSnapshot.create({
    data: {
      adAccountId,
      date: new Date(date),
      platform: 'META_ADS',
      impressions: BigInt(1000),
      clicks: BigInt(50),
      spend: new Decimal(spend),
      conversions: 5,
      revenue: new Decimal(spend * 3),
    },
  })
}

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('db', testDb as PrismaClient)
  await app.register(metricsRoutes, { prefix: '/api/metrics' })
  return app
}

describe('Metrics Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeAll(async () => {
    app = await buildTestApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // GET /api/metrics?adAccountId=&dateFrom=&dateTo=
  // ─────────────────────────────────────────────

  describe('GET /api/metrics (por adAccountId)', () => {
    it('retorna 200 com rows e totals', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)
      const account = await createAdAccount(client.id)

      await createSnapshot(account.id, '2024-06-01', 300)
      await createSnapshot(account.id, '2024-06-02', 200)

      const token = signToken(admin.id, agency.id)

      const res = await app.inject({
        method: 'GET',
        url: `/api/metrics?adAccountId=${account.id}&clientId=${client.id}&dateFrom=2024-06-01&dateTo=2024-06-30`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.rows).toHaveLength(2)
      expect(body.data.totals.spend).toBe('500.00')
      expect(body.data.rows[0].derived).toBeDefined()
      expect(body.data.rows[0].derived.roas).toBeGreaterThan(0)
    })

    it('retorna 401 sem token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics?adAccountId=abc&clientId=abc&dateFrom=2024-06-01&dateTo=2024-06-30',
      })
      expect(res.statusCode).toBe(401)
    })

    it('retorna 422 quando parâmetros obrigatórios estão ausentes', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const token = signToken(admin.id, agency.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(422)
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/metrics/summary?clientId=&dateFrom=&dateTo=
  // ─────────────────────────────────────────────

  describe('GET /api/metrics/summary', () => {
    it('retorna 200 com totais do cliente', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client = await createTestClient(agency.id)
      const account1 = await createAdAccount(client.id, 'act_s1')
      const account2 = await createAdAccount(client.id, 'act_s2')

      await createSnapshot(account1.id, '2024-06-01', 400)
      await createSnapshot(account2.id, '2024-06-01', 600)

      const token = signToken(admin.id, agency.id)

      const res = await app.inject({
        method: 'GET',
        url: `/api/metrics/summary?clientId=${client.id}&dateFrom=2024-06-01&dateTo=2024-06-30`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.totals.spend).toBe('1000.00')
      expect(body.data.totals.derived.roas).toBeGreaterThan(0)
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/metrics/agency-summary?dateFrom=&dateTo=
  // ─────────────────────────────────────────────

  describe('GET /api/metrics/agency-summary', () => {
    it('retorna 200 com sumário da agência e topClients', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const client1 = await createTestClient(agency.id, { name: 'Cliente A' })
      const client2 = await createTestClient(agency.id, { name: 'Cliente B' })

      const account1 = await createAdAccount(client1.id, 'act_a1')
      const account2 = await createAdAccount(client2.id, 'act_b1')

      await createSnapshot(account1.id, '2024-06-01', 1000)
      await createSnapshot(account2.id, '2024-06-01', 500)

      const token = signToken(admin.id, agency.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics/agency-summary?dateFrom=2024-06-01&dateTo=2024-06-30',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.totals.spend).toBe('1500.00')
      expect(body.data.topClients).toHaveLength(2)
      expect(body.data.topClients[0].clientName).toBe('Cliente A')
    })

    it('retorna 403 para CLIENT_VIEWER', async () => {
      const agency = await createTestAgency()
      const viewer = await createTestUser(agency.id, { role: 'CLIENT_VIEWER' })
      const token = signToken(viewer.id, agency.id, 'CLIENT_VIEWER')

      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics/agency-summary?dateFrom=2024-06-01&dateTo=2024-06-30',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })
})
