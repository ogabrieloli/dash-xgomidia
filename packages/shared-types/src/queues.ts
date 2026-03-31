// ─────────────────────────────────────────────
// QUEUE NAMES
// ─────────────────────────────────────────────

export const QUEUES = {
  META_ADS_SYNC: 'meta-ads-sync',
  GOOGLE_ADS_SYNC: 'google-ads-sync',
  AI_INSIGHTS: 'ai-insights',
  REPORT_RENDER: 'report-render',
  NOTIFICATIONS: 'notifications',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

// ─────────────────────────────────────────────
// JOB PAYLOADS
// ─────────────────────────────────────────────

export interface DateRange {
  from: string // ISO date YYYY-MM-DD
  to: string   // ISO date YYYY-MM-DD
}

export interface MetaAdsSyncJob {
  adAccountId: string
  clientId: string
  dateRange: DateRange
  triggeredBy: 'scheduler' | 'manual'
}

export interface GoogleAdsSyncJob {
  adAccountId: string
  clientId: string
  dateRange: DateRange
  triggeredBy: 'scheduler' | 'manual'
}

export interface AiInsightsJob {
  strategyId: string
  clientId: string
  insightType: 'SUMMARY' | 'COMPARISON' | 'SUGGESTION' | 'ALERT'
  triggeredBy: 'scheduler' | 'manual' | 'rules_engine'
}

export interface ReportRenderJob {
  reportId: string
  clientId: string
  type: 'PDF' | 'PPT' | 'WEB'
}

export interface NotificationJob {
  type: 'REPORT_READY' | 'ALERT' | 'INSIGHT'
  recipientEmail: string
  recipientName: string
  payload: Record<string, unknown>
}
