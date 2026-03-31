export const USER_ROLES = {
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  AGENCY_MANAGER: 'AGENCY_MANAGER',
  CLIENT_VIEWER: 'CLIENT_VIEWER',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const PLATFORMS = {
  META_ADS: 'META_ADS',
  GOOGLE_ADS: 'GOOGLE_ADS',
  TIKTOK_ADS: 'TIKTOK_ADS',
  LINKEDIN_ADS: 'LINKEDIN_ADS',
} as const

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS]

export const FUNNEL_TYPES = {
  WEBINAR: 'WEBINAR',
  DIRECT_SALE: 'DIRECT_SALE',
  LEAD_GENERATION: 'LEAD_GENERATION',
  ECOMMERCE: 'ECOMMERCE',
  CUSTOM: 'CUSTOM',
} as const

export type FunnelType = (typeof FUNNEL_TYPES)[keyof typeof FUNNEL_TYPES]

export const INSIGHT_TYPES = {
  ALERT: 'ALERT',
  SUGGESTION: 'SUGGESTION',
  SUMMARY: 'SUMMARY',
  COMPARISON: 'COMPARISON',
} as const

export type InsightType = (typeof INSIGHT_TYPES)[keyof typeof INSIGHT_TYPES]

export const SEVERITIES = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const

export type Severity = (typeof SEVERITIES)[keyof typeof SEVERITIES]

export const INSIGHT_SOURCES = {
  RULES_ENGINE: 'RULES_ENGINE',
  LLM: 'LLM',
} as const

export type InsightSource = (typeof INSIGHT_SOURCES)[keyof typeof INSIGHT_SOURCES]

export const REPORT_TYPES = {
  PDF: 'PDF',
  PPT: 'PPT',
  WEB: 'WEB',
} as const

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES]

export const REPORT_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  ERROR: 'ERROR',
} as const

export type ReportStatus = (typeof REPORT_STATUSES)[keyof typeof REPORT_STATUSES]

export const SYNC_STATUSES = {
  PENDING: 'PENDING',
  SYNCING: 'SYNCING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const

export type SyncStatus = (typeof SYNC_STATUSES)[keyof typeof SYNC_STATUSES]

export const TIMELINE_ENTRY_TYPES = {
  ACTION: 'ACTION',
  MEETING: 'MEETING',
  OPTIMIZATION: 'OPTIMIZATION',
  NOTE: 'NOTE',
  ALERT: 'ALERT',
} as const

export type TimelineEntryType = (typeof TIMELINE_ENTRY_TYPES)[keyof typeof TIMELINE_ENTRY_TYPES]
