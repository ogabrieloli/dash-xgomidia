/**
 * MetaAdapter — implementa PlatformAdapter para Meta Ads.
 *
 * Responsabilidades:
 *  - Buscar insights de campanhas via Meta Marketing API
 *  - Normalizar para NormalizedMetric
 *  - Renovar access token quando necessário
 *
 * IMPORTANTE: o token de acesso é passado pelo caller (worker) que o lê do Vault.
 * Este adapter nunca acessa o Vault diretamente.
 */
import type { PlatformAdapter, NormalizedMetric, TokenResponse } from '@xgo/metrics-schema'
import type { DateRange } from '@xgo/shared-types'

const META_API_VERSION = 'v25.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaInsightRow {
  date_start: string
  date_stop: string
  impressions: string
  clicks: string
  spend: string
  reach?: string
  inline_link_clicks?: string
  landing_page_view?: string
  campaign_id?: string
  campaign_name?: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>
}

interface MetaInsightsResponse {
  data: MetaInsightRow[]
  paging?: {
    next?: string
  }
}

interface MetaRefreshTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface MetaTokenDebugResponse {
  data: {
    is_valid: boolean
    expires_at?: number
    error?: { message: string }
  }
}

/**
 * Soma apenas as ações "folhas" (disjuntas) para evitar duplicação.
 * Geralmente soma offsite_conversion.* e onsite_conversion.* que contenham a palavra-chave.
 * Isso evita somar o agregado 'purchase' com seus componentes.
 */
function sumGoalActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  keyword: string
): number {
  if (!actions) return 0
  let total = 0
  for (const action of actions) {
    const type = action.action_type.toLowerCase()
    const kw = keyword.toLowerCase()

    // Filtramos para pegar apenas eventos específicos de conversão
    const isSpecificConversion = type.startsWith('offsite_conversion.') || type.startsWith('onsite_conversion.')

    if (isSpecificConversion && type.includes(kw)) {
      total += parseFloat(action.value)
    }
  }

  // Backup: se não encontrou nada específico mas existe a chave genérica, usa ela
  if (total === 0) {
    const kw = keyword.toLowerCase()
    const generic = actions.find(a => a.action_type.toLowerCase() === kw)
    if (generic) total = parseFloat(generic.value)
  }

  return total
}

function extractActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  ...types: string[]
): number {
  for (const type of types) {
    const found = actions?.find((a) => a.action_type === type)
    if (found && parseFloat(found.value) > 0) return parseFloat(found.value)
  }
  return 0
}

/**
 * Soma os valores de vários action_types de forma flexível.
 * Se 'fuzzy' for true, também inclui qualquer tipo que contenha uma das palavras-chave
 * e que ainda não tenha sido contabilizado.
 */
function sumActionValues(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[],
  fuzzyKeywords: string[] = []
): number {
  let total = 0
  const matchedTypes = new Set<string>()

  // 1. Soma tipos exatos
  for (const type of types) {
    const found = actions?.find((a) => a.action_type === type)
    if (found) {
      total += parseFloat(found.value)
      matchedTypes.add(type)
    }
  }

  // 2. Busca fuzzy (para conversões customizadas que não conhecemos o nome exato)
  if (fuzzyKeywords.length > 0 && actions) {
    for (const action of actions) {
      if (matchedTypes.has(action.action_type)) continue

      const isFuzzyMatch = fuzzyKeywords.some(kw =>
        action.action_type.toLowerCase().includes(kw.toLowerCase())
      )

      if (isFuzzyMatch) {
        total += parseFloat(action.value)
        matchedTypes.add(action.action_type)
      }
    }
  }

  return total
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
          // Campos individuais de conversão por objetivo
          // Usamos a lógica de soma de objetivos específicos (Site + App + Custom)
          // Isso evita duplicar com a chave 'purchase' agregada
          const purchases = sumGoalActions(row.actions, 'purchase')
          const leads = sumGoalActions(row.actions, 'lead')

          const addToCart = extractActionValue(row.actions,
            'offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart')
          const initiateCheckout = extractActionValue(row.actions,
            'offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout')
          const viewContent = extractActionValue(row.actions,
            'offsite_conversion.fb_pixel_view_content', 'view_content')
          const completeRegistration = extractActionValue(row.actions,
            'offsite_conversion.fb_pixel_complete_registration', 'complete_registration')
          const postEngagement = extractActionValue(row.actions,
            'post_engagement', 'page_engagement', 'like')
          const videoViews3s = extractActionValue(row.actions, 'video_view', 'video_view_3s')

          // Topo de funil social
          const directProfileVisit = extractActionValue(row.actions, 'profile_visit')
          const igProfileView = extractActionValue(row.actions, 'ig_profile_view', 'omni_profile_visit')
          const pageEngagement = extractActionValue(row.actions, 'page_engagement')

          // Hierarquia: dado real > ig_profile_view > estimativa conservadora (0.3 de page_engagement)
          const profileVisits = directProfileVisit > 0 ? directProfileVisit
            : igProfileView > 0 ? igProfileView
              : Math.round(pageEngagement * 0.3)

          // conversions = soma retrocompatível
          const conversions = purchases + leads + completeRegistration

          // Receita: SOMAMOS apenas as fontes específicas de valor
          const revenue = sumGoalActions(row.action_values, 'purchase')

          // Landing page views: campo top-level ou fallback via actions
          const landingPageViews =
            parseInt(row.landing_page_view ?? '0', 10) ||
            extractActionValue(row.actions, 'landing_page_view')

          const metric: NormalizedMetric = {
            date: row.date_start,
            platform: 'META_ADS',
            externalAccountId: accountId,
            impressions: parseInt(row.impressions, 10) || 0,
            clicks: parseInt(row.clicks, 10) || 0,
            spend: parseFloat(row.spend) || 0,
            conversions,
            leads,
            purchases,
            addToCart,
            initiateCheckout,
            viewContent,
            completeRegistration,
            postEngagement,
            videoViews3s,
            profileVisits,
            pageEngagement,
            linkClicks: parseInt(row.inline_link_clicks ?? '0', 10) || 0,
            landingPageViews,
            rawData: row,
          }

          if (revenue > 0) {
            metric.revenue = revenue
          }

          if (row.reach !== undefined) {
            metric.reach = parseInt(row.reach, 10) || 0
          }

          const videoViews = extractActionValue(row.video_thruplay_watched_actions, 'video_view')
          if (videoViews > 0) {
            metric.videoViews = videoViews
          }

          if (row.campaign_id) {
            metric.externalCampaignId = row.campaign_id
            if (row.campaign_name !== undefined) {
              metric.campaignName = row.campaign_name
            }
          }

          metrics.push(metric)
        }

        nextUrl = body.paging?.next
      } finally {
        clearTimeout(timeoutId)
      }
    }

    return metrics
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    // Meta Ads usa long-lived user tokens — renovação via app secret proof
    // Um long-lived token pode ser trocado por um novo long-lived token
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: refreshToken,
    })

    const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`)

    if (!res.ok) {
      throw new Error(`Meta token refresh failed: ${res.status}`)
    }

    const data = await res.json() as MetaRefreshTokenResponse

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    const appSecretProof = await this.computeAppSecretProof(accessToken)

    const params = new URLSearchParams({
      input_token: accessToken,
      access_token: `${this.appId}|${this.appSecret}`,
      appsecret_proof: appSecretProof,
    })

    const res = await fetch(`${META_GRAPH_URL}/debug_token?${params.toString()}`)

    if (!res.ok) return false

    const body = await res.json() as MetaTokenDebugResponse
    return body.data?.is_valid === true
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
      'actions',
      'action_values',
      'video_thruplay_watched_actions',
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

  private async computeAppSecretProof(accessToken: string): Promise<string> {
    // HMAC-SHA256(app_secret, access_token) em hex
    const { createHmac } = await import('node:crypto')
    return createHmac('sha256', this.appSecret).update(accessToken).digest('hex')
  }
}
