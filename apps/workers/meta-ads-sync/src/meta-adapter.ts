import { PlatformAdapter, NormalizedMetric, DateRange } from './types.js'
import { Decimal } from '@prisma/client/runtime/library'

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0'

interface MetaInsightsResponse {
  data: Array<{
    date_start: string
    date_stop: string
    impressions: string
    clicks: string
    spend: string
    reach: string
    inline_link_clicks: string
    landing_page_view: string
    campaign_id: string
    campaign_name: string
    actions?: Array<{ action_type: string; value: string }>
    action_values?: Array<{ action_type: string; value: string }>
  }>
  paging?: {
    next: string
  }
}

/**
 * Helper simples para extrair o valor de uma métrica específica do Meta.
 * Seguindo a orientação: NÃO somamos chaves; usamos apenas a chave canônica (ex: 'purchase').
 */
function getMetaMetric(
  actions: Array<{ action_type: string; value: string }> | undefined,
  type: string
): number {
  if (!actions) return 0
  const found = actions.find((a) => a.action_type.toLowerCase() === type.toLowerCase())
  return found ? parseFloat(found.value) : 0
}

export class MetaAdapter implements PlatformAdapter {
  private readonly appId: string
  private readonly appSecret: string

  constructor(appId: string, appSecret: string) {
    this.appId = appId
    this.appSecret = appSecret
  }

  async fetchMetrics(
    accountId: string,
    accessToken: string,
    dateRange: DateRange,
    level: 'account' | 'campaign' = 'campaign',
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = []
    let nextUrl: string | undefined = this.buildInsightsUrl(accountId, accessToken, dateRange, level)

    while (nextUrl) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      try {
        const res = await fetch(nextUrl, { signal: controller.signal })

        if (!res.ok) {
          const errorBody = await res.text()
          throw new Error(`Meta API error ${res.status}: ${errorBody}`)
        }

        const body = (await res.json()) as MetaInsightsResponse

        for (const row of body.data) {
          // MAPEAMENTO CANÔNICO (Conforme orientação: usar APENAS a chave principal)
          // Isso garante 100% de paridade com o 'Resultados' do Gerenciador de Anúncios.
          const purchases = getMetaMetric(row.actions, 'purchase')
          const leads = getMetaMetric(row.actions, 'lead')
          const addToCart = getMetaMetric(row.actions, 'add_to_cart')
          const initiateCheckout = getMetaMetric(row.actions, 'initiate_checkout')
          const viewContent = getMetaMetric(row.actions, 'view_content')
          const completeRegistration = getMetaMetric(row.actions, 'complete_registration')
          const postEngagement = getMetaMetric(row.actions, 'post_engagement')
          const videoViews = getMetaMetric(row.actions, 'video_view')
          const videoViews3s = getMetaMetric(row.actions, 'video_view') // Caso queira diferenciar no futuro, por ora usamos a base

          // Topo de funil social - fallbacks simples
          const profileVisits =
            getMetaMetric(row.actions, 'profile_visit') ||
            getMetaMetric(row.actions, 'ig_profile_view') ||
            Math.round(getMetaMetric(row.actions, 'page_engagement') * 0.3)

          const pageEngagement = getMetaMetric(row.actions, 'page_engagement')

          // Valor de conversão (Receita)
          const revenue = getMetaMetric(row.action_values, 'purchase')

          // Landing page views: campo top-level ou fallback via actions
          const landingPageViews =
            parseInt(row.landing_page_view ?? '0', 10) ||
            getMetaMetric(row.actions, 'landing_page_view')

          const metric: NormalizedMetric = {
            date: row.date_start,
            platform: 'META_ADS',
            externalAccountId: accountId,
            externalCampaignId: level === 'campaign' ? row.campaign_id : null,
            campaignName: level === 'campaign' ? row.campaign_name : null,
            impressions: parseInt(row.impressions, 10),
            clicks: parseInt(row.clicks, 10),
            spend: new Decimal(row.spend),
            reach: parseInt(row.reach ?? '0', 10),
            videoViews: parseInt(row.reach ?? '0', 10), // Simplificado
            conversions: purchases + leads + completeRegistration, // Retrocompatibilidade de soma de objetivos
            revenue: new Decimal(revenue),
            leads,
            completeRegistration,
            landingPageViews,
            linkClicks: parseInt(row.inline_link_clicks ?? '0', 10),
            purchases,
            addToCart,
            initiateCheckout,
            viewContent,
            postEngagement,
            videoViews3s: videoViews, // simplificado
            profileVisits,
            pageEngagement,
            followersEstimated: 0, // calculado no SocialAttributionService
            rawData: row,
          }

          metrics.push(metric)
        }

        nextUrl = body.paging?.next
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Meta API request timed out after 30s')
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    }

    return metrics
  }

  async refreshToken(accessToken: string): Promise<{ accessToken: string; expiresAt: number }> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: accessToken,
    })

    const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`)
    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    const data = (await res.json()) as { access_token: string; expires_in: number }
    return {
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    }
  }

  private buildInsightsUrl(
    accountId: string,
    accessToken: string,
    dateRange: DateRange,
    level: 'account' | 'campaign' = 'campaign',
  ): string {
    const baseFields = [
      'date_start',
      'date_stop',
      'impressions',
      'clicks',
      'spend',
      'reach',
      'inline_link_clicks',
      'landing_page_view',
      'actions',
      'action_values',
    ]

    if (level === 'campaign') {
      baseFields.push('campaign_id', 'campaign_name')
    }

    const params = new URLSearchParams({
      fields: baseFields.join(','),
      time_range: JSON.stringify({ since: dateRange.from, until: dateRange.to }),
      time_increment: '1', // dia a dia
      level,
      action_attribution_windows: '["7d_click","1d_view"]', // Bate com o padrão do Meta Ads
      action_report_time: 'mixed', // Reporta a conversão no dia do clique
      access_token: accessToken,
      limit: '500',
    })

    return `${META_GRAPH_URL}/${accountId}/insights?${params.toString()}`
  }
}
