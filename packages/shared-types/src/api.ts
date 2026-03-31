// ─────────────────────────────────────────────
// API Response / Error types
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  meta?: {
    page?: number
    total?: number
    totalPages?: number
  }
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// ─────────────────────────────────────────────
// JWT Payload
// ─────────────────────────────────────────────

import type { UserRole } from './roles.js'

export interface JwtPayload {
  sub: string     // userId
  role: UserRole
  agencyId: string
  iat: number
  exp: number
}
