import type { Platform, DateRange } from '@xgo/shared-types'

// ─────────────────────────────────────────────
// Normalized metric — schema unificado
// Todas as plataformas convertem para este formato antes de persistir
// ─────────────────────────────────────────────

export interface NormalizedMetric {
  date: string                  // YYYY-MM-DD
  platform: Platform
  externalAccountId: string
  impressions: number
  clicks: number
  spend: number                 // sempre em BRL (converter se necessário)
  conversions: number
  revenue?: number
  externalCampaignId?: string   // presente quando level=campaign
  campaignName?: string
  rawData: unknown              // dados originais da plataforma — útil para debug
}

// ─────────────────────────────────────────────
// Token response após refresh
// ─────────────────────────────────────────────

export interface TokenResponse {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}

// ─────────────────────────────────────────────
// PlatformAdapter — contrato que cada plataforma implementa
// ─────────────────────────────────────────────

export interface PlatformAdapter {
  /**
   * Busca métricas da plataforma e retorna no formato normalizado.
   * O token de acesso é buscado do Vault pelo caller — não é responsabilidade do adapter.
   */
  fetchMetrics(
    accountId: string,
    accessToken: string,
    dateRange: DateRange,
  ): Promise<NormalizedMetric[]>

  /**
   * Renova o access token usando o refresh token.
   */
  refreshToken(refreshToken: string): Promise<TokenResponse>

  /**
   * Verifica se o access token ainda é válido.
   */
  validateToken(accessToken: string): Promise<boolean>
}

// ─────────────────────────────────────────────
// Métricas derivadas — calculadas, não armazenadas
// ─────────────────────────────────────────────

export interface DerivedMetrics {
  ctr: number    // clicks / impressions * 100
  cpc: number    // spend / clicks
  cpa: number    // spend / conversions
  roas: number   // revenue / spend
  cpm: number    // spend / impressions * 1000
}

export function calculateDerivedMetrics(metric: NormalizedMetric): DerivedMetrics {
  const impressions = metric.impressions || 1
  const clicks = metric.clicks || 1
  const conversions = metric.conversions || 1
  const revenue = metric.revenue ?? 0

  return {
    ctr: (metric.clicks / impressions) * 100,
    cpc: metric.spend / clicks,
    cpa: metric.spend / conversions,
    roas: revenue / (metric.spend || 1),
    cpm: (metric.spend / impressions) * 1000,
  }
}
