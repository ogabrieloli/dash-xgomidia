/**
 * Testes de integração das rotas de contas de anúncio.
 * Usa Fastify em modo test + banco real (docker).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { adAccountsRoutes } from './ad-accounts.routes.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  createTestClient,
  cleanupTestData,
} from '../../test/db.js'

function signTestToken(payload: {
  sub: string
  email: string
  role: string
  agencyId: string
}) {
  return jwt.sign(payload, process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long', {
    expiresIn: '15m',
  })
}

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('db', testDb as PrismaClient)
  await app.register(adAccountsRoutes, { prefix: '/api/ad-accounts' })
  return app
}

describe('AdAccounts Routes', () => {
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
  // GET /api/ad-accounts?clientId=
  // ─────────────────────────────────────────────

  describe('GET /api/ad-accounts', () => {
    it('retorna 200 com lista de contas do cliente', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })
      const client = await createTestClient(agency.id)

      await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_123',
          name: 'Conta Teste',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_123',
        },
      })

      const token = signTestToken({
        sub: admin.id,
        email: admin.email,
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/ad-accounts?clientId=${client.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].externalId).toBe('act_123')
      // Garantir que vaultSecretPath não aparece na resposta
      expect(body.data[0].vaultSecretPath).toBeUndefined()
    })

    it('retorna 401 sem token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ad-accounts?clientId=qualquer',
      })
      expect(response.statusCode).toBe(401)
    })

    it('retorna 422 sem clientId', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id)
      const token = signTestToken({
        sub: admin.id,
        email: admin.email,
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/ad-accounts',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // ─────────────────────────────────────────────
  // POST /api/ad-accounts
  // ─────────────────────────────────────────────

  describe('POST /api/ad-accounts', () => {
    it('retorna 201 ao criar uma conta de anúncio', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })
      const client = await createTestClient(agency.id)

      const token = signTestToken({
        sub: admin.id,
        email: admin.email,
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/ad-accounts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_new_123',
          name: 'Nova Conta',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_new_123',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.data.externalId).toBe('act_new_123')
      expect(body.data.platform).toBe('META_ADS')
      expect(body.data.clientId).toBe(client.id)
    })

    it('retorna 403 para CLIENT_VIEWER', async () => {
      const agency = await createTestAgency()
      const viewer = await createTestUser(agency.id, { role: 'CLIENT_VIEWER' })
      const client = await createTestClient(agency.id)

      const token = signTestToken({
        sub: viewer.id,
        email: viewer.email,
        role: 'CLIENT_VIEWER',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/ad-accounts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_hacker',
          name: 'Hack',
          vaultSecretPath: 'secret/hack',
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // ─────────────────────────────────────────────
  // DELETE /api/ad-accounts/:id
  // ─────────────────────────────────────────────

  describe('DELETE /api/ad-accounts/:id', () => {
    it('retorna 204 ao desconectar uma conta', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_to_del',
          name: 'Deletar',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_to_del',
        },
      })

      const token = signTestToken({
        sub: admin.id,
        email: admin.email,
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/ad-accounts/${account.id}?clientId=${client.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(204)

      const inDb = await testDb.adAccount.findUnique({ where: { id: account.id } })
      expect(inDb).toBeNull()
    })
  })

  // ─────────────────────────────────────────────
  // POST /api/ad-accounts/:id/sync
  // ─────────────────────────────────────────────

  describe('POST /api/ad-accounts/:id/sync', () => {
    it('retorna 202 ao enfileirar sync manual', async () => {
      const agency = await createTestAgency()
      const admin = await createTestUser(agency.id, { role: 'AGENCY_ADMIN' })
      const client = await createTestClient(agency.id)

      const account = await testDb.adAccount.create({
        data: {
          clientId: client.id,
          platform: 'META_ADS',
          externalId: 'act_sync',
          name: 'Sync',
          vaultSecretPath: 'secret/clients/test/meta-ads/act_sync',
        },
      })

      const token = signTestToken({
        sub: admin.id,
        email: admin.email,
        role: 'AGENCY_ADMIN',
        agencyId: agency.id,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/ad-accounts/${account.id}/sync?clientId=${client.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(202)
      const body = response.json()
      expect(body.data.jobId).toBeTruthy()
    })
  })
})
