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

const META_API_VERSION = 'v19.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaInsightRow {
  date_start: string
  date_stop: string
  impressions: string
  clicks: string
  spend: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
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

function extractActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  const found = actions?.find((a) => a.action_type === type)
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
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = []
    let nextUrl: string | undefined = this.buildInsightsUrl(accountId, accessToken, dateRange)

    while (nextUrl) {
      const res = await fetch(nextUrl)

      if (!res.ok) {
        const errorBody = await res.text()
        throw new Error(`Meta API error ${res.status}: ${errorBody}`)
      }

      const body = await res.json() as MetaInsightsResponse

      for (const row of body.data) {
        const conversions =
          extractActionValue(row.actions, 'purchase') +
          extractActionValue(row.actions, 'lead') +
          extractActionValue(row.actions, 'complete_registration')

        const revenue = extractActionValue(row.action_values, 'purchase')

        const metric: NormalizedMetric = {
          date: row.date_start,
          platform: 'META_ADS',
          externalAccountId: accountId,
          impressions: parseInt(row.impressions, 10) || 0,
          clicks: parseInt(row.clicks, 10) || 0,
          spend: parseFloat(row.spend) || 0,
          conversions,
          rawData: row,
        }

        if (revenue > 0) {
          metric.revenue = revenue
        }

        metrics.push(metric)
      }

      nextUrl = body.paging?.next
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

  private buildInsightsUrl(accountId: string, accessToken: string, dateRange: DateRange): string {
    const fields = [
      'date_start',
      'date_stop',
      'impressions',
      'clicks',
      'spend',
      'actions',
      'action_values',
    ].join(',')

    const params = new URLSearchParams({
      fields,
      time_range: JSON.stringify({ since: dateRange.from, until: dateRange.to }),
      time_increment: '1', // dia a dia
      level: 'account',
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
