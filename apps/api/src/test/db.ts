/**
 * Helper de banco de dados para testes.
 * Usa o banco real em docker — não mocks.
 *
 * Regra: NUNCA mockar o banco. Usar banco real com cleanup entre testes.
 * Referência: CLAUDE.md § Testes
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { UserRole } from '@xgo/shared-types'

export const testDb = new PrismaClient()

// ─────────────────────────────────────────────
// Factories — criar entidades de teste rápido
// ─────────────────────────────────────────────

export async function createTestAgency(overrides: Partial<{ name: string; slug: string }> = {}) {
  const slug = overrides.slug ?? `agency-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return testDb.agency.create({
    data: {
      name: overrides.name ?? 'Test Agency',
      slug,
    },
  })
}

export async function createTestUser(
  agencyId: string,
  overrides: Partial<{
    email: string
    password: string
    role: UserRole
  }> = {},
) {
  const password = overrides.password ?? 'TestPassword123!'
  const passwordHash = await bcrypt.hash(password, 4) // custo baixo para testes

  return testDb.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}@test.com`,
      passwordHash,
      role: overrides.role ?? 'AGENCY_ADMIN',
      agencyId,
    },
  })
}

export async function createTestClient(
  agencyId: string,
  overrides: Partial<{ name: string; slug: string }> = {},
) {
  const slug = overrides.slug ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return testDb.client.create({
    data: {
      agencyId,
      name: overrides.name ?? 'Test Client',
      slug,
    },
  })
}

// ─────────────────────────────────────────────
// Cleanup — remover dados após cada teste
// ─────────────────────────────────────────────

export async function cleanupTestData() {
  // Ordem importa por causa das foreign keys
  await testDb.auditLog.deleteMany()
  await testDb.refreshToken.deleteMany()
  await testDb.metricSnapshot.deleteMany()
  await testDb.aiInsight.deleteMany()
  await testDb.report.deleteMany()
  await testDb.timelineEntry.deleteMany()
  await testDb.clientUserAccess.deleteMany()
  await testDb.adAccount.deleteMany()
  await testDb.strategy.deleteMany()
  await testDb.project.deleteMany()
  await testDb.client.deleteMany()
  await testDb.user.deleteMany()
  await testDb.agency.deleteMany()
}
