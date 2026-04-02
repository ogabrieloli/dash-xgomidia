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
  reach?: number                // pessoas únicas alcançadas
  videoViews?: number           // visualizações de vídeo (ThruPlay ≥15s)

  // Objetivo: LEAD
  leads?: number                // action_type: lead
  completeRegistration?: number // action_type: complete_registration
  landingPageViews?: number     // landing_page_view
  linkClicks?: number           // inline_link_clicks

  // Objetivo: SALES
  purchases?: number            // action_type: purchase
  addToCart?: number            // action_type: add_to_cart
  initiateCheckout?: number     // action_type: initiate_checkout
  viewContent?: number          // action_type: view_content

  // Objetivo: BRANDING
  postEngagement?: number       // action_type: post_engagement
  videoViews3s?: number         // action_type: video_view (≥3s)

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
