/**
 * Testes de integração das rotas de autenticação.
 * Usa Fastify em modo test + banco real (docker).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { PrismaClient } from '@prisma/client'
import { AuthService } from './auth.service.js'
import { authRoutes } from './auth.routes.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  cleanupTestData,
} from '../../test/db.js'

async function buildTestApp() {
  const app = Fastify({ logger: false })

  await app.register(cookie, { secret: 'test-cookie-secret' })

  // Injetar db no app para as rotas
  app.decorate('db', testDb as PrismaClient)

  await app.register(authRoutes, { prefix: '/auth' })

  return app
}

describe('Auth Routes', () => {
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
  // POST /auth/login
  // ─────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('retorna 200 com accessToken no body e cookie refresh_token', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, {
        email: 'login@test.com',
        password: 'Senha123!',
        role: 'AGENCY_ADMIN',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'login@test.com', password: 'Senha123!' },
      })

      expect(response.statusCode).toBe(200)

      const body = response.json()
      expect(body.data.accessToken).toBeTruthy()
      expect(body.data.user.email).toBe('login@test.com')
      expect(body.data.user.role).toBe('AGENCY_ADMIN')
      // Senha NUNCA deve aparecer na resposta
      expect(body.data.user.passwordHash).toBeUndefined()

      // Cookie httpOnly deve estar presente
      const setCookie = response.headers['set-cookie'] as string
      expect(setCookie).toContain('refresh_token=')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
    })

    it('retorna 401 para credenciais inválidas', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'user@test.com', password: 'Senha123!' })

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'user@test.com', password: 'SenhaErrada!' },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('UNAUTHORIZED')
    })

    it('retorna 422 quando body está incompleto', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'sem-senha@test.com' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('retorna 422 quando email é inválido', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nao-e-email', password: 'Senha123!' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('limita tentativas de login (rate limiting não é testado aqui — é por IP)', async () => {
      // Verifica que a resposta para email inexistente é idêntica à de senha errada
      // (previne user enumeration)
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'real@test.com', password: 'Senha123!' })

      const resWrongEmail = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nao-existe@test.com', password: 'Senha123!' },
      })

      const resWrongPass = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'real@test.com', password: 'SenhaErrada!' },
      })

      // Ambos devem retornar 401 com a mesma mensagem
      expect(resWrongEmail.statusCode).toBe(401)
      expect(resWrongPass.statusCode).toBe(401)
      expect(resWrongEmail.json().error.message).toBe(resWrongPass.json().error.message)
    })
  })

  // ─────────────────────────────────────────────
  // POST /auth/refresh
  // ─────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('retorna novo accessToken com refresh token válido no cookie', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'refresh@test.com', password: 'Senha123!' })

      // Login para obter o cookie
      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'refresh@test.com', password: 'Senha123!' },
      })

      const cookies = loginRes.headers['set-cookie'] as string
      const refreshCookie = cookies.split(';')[0] ?? ''

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { cookie: refreshCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.accessToken).toBeTruthy()

      // Novo cookie de refresh deve ser emitido
      const newCookies = response.headers['set-cookie'] as string
      expect(newCookies).toContain('refresh_token=')
    })

    it('retorna 401 quando cookie de refresh está ausente', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('retorna 200 e limpa o cookie de refresh', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'logout@test.com', password: 'Senha123!' })

      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'logout@test.com', password: 'Senha123!' },
      })

      const cookies = loginRes.headers['set-cookie'] as string
      const refreshCookie = cookies.split(';')[0] ?? ''

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie: refreshCookie },
      })

      expect(response.statusCode).toBe(200)

      // Cookie deve ser limpo (Max-Age=0 ou expirado)
      const setCookie = response.headers['set-cookie'] as string
      expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/)
    })

    it('retorna 200 mesmo sem cookie (logout idempotente)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
