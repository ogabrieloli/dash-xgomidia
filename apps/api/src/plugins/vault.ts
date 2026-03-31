import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Platform } from '@xgo/shared-types'

// Vault client type (simplified)
interface VaultClient {
  write(path: string, data: Record<string, unknown>): Promise<void>
  read(path: string): Promise<{ data: Record<string, unknown> }>
  delete(path: string): Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance {
    vault: VaultClient
  }
}

interface AdAccountTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}

interface StoredTokens {
  access_token: string
  refresh_token?: string
  expires_at: string
}

export const registerVault = fp(async (app: FastifyInstance) => {
  // Dynamic import for node-vault (CommonJS module)
  const nodeVault = await import('node-vault')
  const vault = nodeVault.default({
    apiVersion: 'v1',
    endpoint: process.env['VAULT_ADDR'] ?? 'http://localhost:8200',
    token: process.env['VAULT_TOKEN'] ?? 'root',
  }) as unknown as VaultClient

  app.decorate('vault', vault)
  app.log.info('Vault client registered')
})

// ─────────────────────────────────────────────
// Helpers de tokens — usar nos workers e na API
// ─────────────────────────────────────────────

export function buildVaultPath(clientId: string, platform: Platform, externalId: string): string {
  return `secret/clients/${clientId}/${platform.toLowerCase()}/${externalId}`
}

export async function storeAdAccountToken(
  vault: VaultClient,
  clientId: string,
  platform: Platform,
  externalId: string,
  tokens: AdAccountTokens,
): Promise<string> {
  const path = buildVaultPath(clientId, platform, externalId)

  await vault.write(path, {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? null,
    expires_at: tokens.expiresAt.toISOString(),
  })

  // Retornar apenas o path — que vai para o banco
  return path
}

export async function getAdAccountToken(
  vault: VaultClient,
  vaultSecretPath: string,
): Promise<StoredTokens> {
  const result = await vault.read(vaultSecretPath)
  return result.data as unknown as StoredTokens
}

export async function revokeAdAccountToken(
  vault: VaultClient,
  vaultSecretPath: string,
): Promise<void> {
  await vault.delete(vaultSecretPath)
}
