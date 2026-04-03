import type { Platform, DateRange } from '@xgo/shared-types'
import type { Decimal } from '@prisma/client/runtime/library'

export { DateRange }

export interface NormalizedMetric {
    date: string
    platform: Platform
    externalAccountId: string
    externalCampaignId?: string | null
    campaignName?: string | null
    impressions: number
    clicks: number
    spend: Decimal
    conversions: number
    revenue: Decimal
    reach?: number
    videoViews?: number
    leads?: number
    completeRegistration?: number
    landingPageViews?: number
    linkClicks?: number
    purchases?: number
    addToCart?: number
    initiateCheckout?: number
    viewContent?: number
    postEngagement?: number
    videoViews3s?: number
    profileVisits?: number
    pageEngagement?: number
    followersEstimated?: number
    rawData: any
}

export interface PlatformAdapter {
    fetchMetrics(
        accountId: string,
        accessToken: string,
        dateRange: DateRange,
        level?: 'account' | 'campaign'
    ): Promise<NormalizedMetric[]>

    refreshToken?(accessToken: string): Promise<{ accessToken: string; expiresAt: number }>
}
