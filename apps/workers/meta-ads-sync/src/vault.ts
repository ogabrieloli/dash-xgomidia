/**
 * Helpers de Vault para o worker meta-ads-sync.
 * Replicados do apps/api/src/plugins/vault.ts para manter o worker independente.
 */
import type { Platform } from '@xgo/shared-types'

interface VaultClient {
  write(path: string, data: Record<string, unknown>): Promise<void>
  read(path: string): Promise<{ data: Record<string, unknown> }>
  delete(path: string): Promise<void>
}

interface StoredTokens {
  access_token: string
  refresh_token?: string
  expires_at: string
}

interface AdAccountTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}

export function buildVaultPath(clientId: string, platform: Platform, externalId: string): string {
  return `secret/clients/${clientId}/${platform.toLowerCase()}/${externalId}`
}

export async function getAdAccountToken(
  vault: VaultClient,
  vaultSecretPath: string,
): Promise<StoredTokens> {
  const result = await vault.read(vaultSecretPath)
  return result.data as unknown as StoredTokens
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

  return path
}
