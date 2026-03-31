/**
 * Testes do AuthService.
 * Usa banco real (docker) — sem mocks de banco.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AuthService } from './auth.service.js'
import {
  testDb,
  createTestAgency,
  createTestUser,
  cleanupTestData,
} from '../../test/db.js'

describe('AuthService', () => {
  let authService: AuthService

  beforeEach(() => {
    authService = new AuthService(testDb)
  })

  afterEach(async () => {
    await cleanupTestData()
  })

  // ─────────────────────────────────────────────
  // login()
  // ─────────────────────────────────────────────

  describe('login()', () => {
    it('retorna accessToken e userId quando credenciais são válidas', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, {
        email: 'admin@test.com',
        password: 'CorrectPassword123!',
        role: 'AGENCY_ADMIN',
      })

      const result = await authService.login('admin@test.com', 'CorrectPassword123!')

      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      expect(result.user.email).toBe('admin@test.com')
      expect(result.user.role).toBe('AGENCY_ADMIN')
    })

    it('lança erro quando e-mail não existe', async () => {
      await expect(
        authService.login('naoexiste@test.com', 'qualquerSenha'),
      ).rejects.toThrow('Credenciais inválidas')
    })

    it('lança erro quando senha está incorreta', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, {
        email: 'user@test.com',
        password: 'CorrectPassword123!',
      })

      await expect(
        authService.login('user@test.com', 'SenhaErrada!'),
      ).rejects.toThrow('Credenciais inválidas')
    })

    it('não permite login com conta soft-deleted', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id, { email: 'deleted@test.com' })

      // Soft delete o usuário
      await testDb.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      })

      await expect(
        authService.login('deleted@test.com', 'TestPassword123!'),
      ).rejects.toThrow('Credenciais inválidas')
    })

    it('armazena apenas o hash do refresh token no banco, nunca o token em claro', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'hash@test.com', password: 'Senha123!' })

      const result = await authService.login('hash@test.com', 'Senha123!')

      const stored = await testDb.refreshToken.findFirst({
        where: { user: { email: 'hash@test.com' } },
      })

      expect(stored).toBeTruthy()
      // O hash armazenado NÃO deve ser igual ao token retornado
      expect(stored!.tokenHash).not.toBe(result.refreshToken)
      // O hash deve ter comprimento de SHA-256 hex (64 chars)
      expect(stored!.tokenHash).toHaveLength(64)
    })

    it('registra AuditLog no login bem-sucedido', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id, { email: 'audit@test.com', password: 'Senha123!' })

      await authService.login('audit@test.com', 'Senha123!')

      const log = await testDb.auditLog.findFirst({
        where: { action: 'auth.login', resourceId: user.id },
      })

      expect(log).toBeTruthy()
      expect(log!.action).toBe('auth.login')
    })
  })

  // ─────────────────────────────────────────────
  // refresh()
  // ─────────────────────────────────────────────

  describe('refresh()', () => {
    it('retorna novo par de tokens para refresh token válido', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'refresh@test.com', password: 'Senha123!' })

      const loginResult = await authService.login('refresh@test.com', 'Senha123!')
      const result = await authService.refresh(loginResult.refreshToken)

      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      // Novo token deve ser diferente do anterior (rotação obrigatória)
      expect(result.refreshToken).not.toBe(loginResult.refreshToken)
    })

    it('revoga o refresh token antigo após uso (rotação obrigatória)', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'rotate@test.com', password: 'Senha123!' })

      const loginResult = await authService.login('rotate@test.com', 'Senha123!')
      await authService.refresh(loginResult.refreshToken)

      // Tentar usar o token antigo novamente deve falhar
      await expect(
        authService.refresh(loginResult.refreshToken),
      ).rejects.toThrow()
    })

    it('lança erro para refresh token inválido', async () => {
      await expect(
        authService.refresh('token-completamente-invalido'),
      ).rejects.toThrow()
    })

    it('lança erro para refresh token expirado', async () => {
      const agency = await createTestAgency()
      const user = await createTestUser(agency.id, { email: 'expired@test.com', password: 'Senha123!' })

      // Criar um refresh token já expirado diretamente no banco
      const crypto = await import('crypto')
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

      await testDb.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 1000), // expirado 1s atrás
        },
      })

      await expect(
        authService.refresh(rawToken),
      ).rejects.toThrow('Refresh token expirado ou inválido')
    })
  })

  // ─────────────────────────────────────────────
  // logout()
  // ─────────────────────────────────────────────

  describe('logout()', () => {
    it('revoga o refresh token no logout', async () => {
      const agency = await createTestAgency()
      await createTestUser(agency.id, { email: 'logout@test.com', password: 'Senha123!' })

      const loginResult = await authService.login('logout@test.com', 'Senha123!')
      await authService.logout(loginResult.refreshToken)

      // Após logout, o token não pode mais ser usado
      await expect(
        authService.refresh(loginResult.refreshToken),
      ).rejects.toThrow()
    })

    it('não lança erro quando o token não existe', async () => {
      // logout com token inválido deve ser silencioso
      await expect(
        authService.logout('token-que-nao-existe'),
      ).resolves.not.toThrow()
    })
  })
})
