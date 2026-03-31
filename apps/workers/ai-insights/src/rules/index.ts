/**
 * Rules Engine — 5 regras de alerta automático.
 *
 * Cada regra é uma função pura: recebe RuleInput, retorna RuleResult.
 * Sem efeitos colaterais — a persistência fica no worker.
 */
import type { Severity } from '@xgo/shared-types'

export interface RuleThresholds {
  minRoas?: number   // default 1.5
  maxCpa?: number    // sem default — só dispara se configurado
  minCtr?: number    // default 1.0 (%)
  maxCpm?: number    // default 40 (R$)
}

export interface RuleInput {
  adAccountId: string
  clientId: string
  strategyId?: string | undefined
  periodDays: number
  avgRoas: number
  avgCpa: number
  avgCtr: number       // porcentagem (ex: 1.5 = 1.5%)
  avgCpm: number       // em reais
  totalSpend: number
  thresholds: RuleThresholds
}

export interface RuleResult {
  fired: boolean
  severity: Severity
  title: string
  body: string
  adAccountId: string
  clientId: string
  strategyId?: string | undefined
}

// ─────────────────────────────────────────────
// Regra 1 — ROAS abaixo da meta
// ─────────────────────────────────────────────

export function evaluateRoasRule(input: RuleInput): RuleResult {
  const minRoas = input.thresholds.minRoas ?? 1.5
  const base = {
    adAccountId: input.adAccountId,
    clientId: input.clientId,
    strategyId: input.strategyId,
  }

  if (input.avgRoas < 1.0) {
    return {
      ...base,
      fired: true,
      severity: 'CRITICAL',
      title: `ROAS crítico: ${input.avgRoas.toFixed(2)}x (prejuízo)`,
      body: `O ROAS médio dos últimos ${input.periodDays} dias foi de ${input.avgRoas.toFixed(2)}x, ` +
        `indicando que cada R$1 investido retornou menos de R$1. ` +
        `Revise imediatamente as campanhas ativas.`,
    }
  }

  if (input.avgRoas < minRoas) {
    return {
      ...base,
      fired: true,
      severity: 'WARNING',
      title: `ROAS abaixo da meta: ${input.avgRoas.toFixed(2)}x (meta: ${minRoas}x)`,
      body: `O ROAS médio dos últimos ${input.periodDays} dias (${input.avgRoas.toFixed(2)}x) ` +
        `está abaixo da meta de ${minRoas}x. Avalie criativos e segmentações.`,
    }
  }

  return { ...base, fired: false, severity: 'INFO', title: '', body: '' }
}

// ─────────────────────────────────────────────
// Regra 2 — CPA acima do limite
// ─────────────────────────────────────────────

export function evaluateCpaRule(input: RuleInput): RuleResult {
  const maxCpa = input.thresholds.maxCpa
  const base = {
    adAccountId: input.adAccountId,
    clientId: input.clientId,
    strategyId: input.strategyId,
  }

  if (!maxCpa) {
    return { ...base, fired: false, severity: 'INFO', title: '', body: '' }
  }

  if (input.avgCpa > maxCpa * 2) {
    return {
      ...base,
      fired: true,
      severity: 'CRITICAL',
      title: `CPA crítico: R$${input.avgCpa.toFixed(2)} (limite: R$${maxCpa})`,
      body: `O CPA médio (R$${input.avgCpa.toFixed(2)}) ultrapassou em mais de 2x o limite ` +
        `configurado de R$${maxCpa}. Suspenda campanhas ineficientes.`,
    }
  }

  if (input.avgCpa > maxCpa) {
    return {
      ...base,
      fired: true,
      severity: 'WARNING',
      title: `CPA elevado: R$${input.avgCpa.toFixed(2)} (limite: R$${maxCpa})`,
      body: `O CPA médio dos últimos ${input.periodDays} dias (R$${input.avgCpa.toFixed(2)}) ` +
        `está acima do limite de R$${maxCpa}. Revise públicos e lances.`,
    }
  }

  return { ...base, fired: false, severity: 'INFO', title: '', body: '' }
}

// ─────────────────────────────────────────────
// Regra 3 — CTR baixo
// ─────────────────────────────────────────────

export function evaluateCtrRule(input: RuleInput): RuleResult {
  const minCtr = input.thresholds.minCtr ?? 1.0
  const base = {
    adAccountId: input.adAccountId,
    clientId: input.clientId,
    strategyId: input.strategyId,
  }

  if (input.avgCtr < minCtr) {
    return {
      ...base,
      fired: true,
      severity: 'WARNING',
      title: `CTR baixo: ${input.avgCtr.toFixed(2)}% (mínimo: ${minCtr}%)`,
      body: `O CTR médio dos últimos ${input.periodDays} dias foi de ${input.avgCtr.toFixed(2)}%, ` +
        `abaixo do esperado de ${minCtr}%. Teste novos criativos e chamadas para ação.`,
    }
  }

  return { ...base, fired: false, severity: 'INFO', title: '', body: '' }
}

// ─────────────────────────────────────────────
// Regra 4 — CPM elevado
// ─────────────────────────────────────────────

export function evaluateCpmRule(input: RuleInput): RuleResult {
  const maxCpm = input.thresholds.maxCpm ?? 40
  const base = {
    adAccountId: input.adAccountId,
    clientId: input.clientId,
    strategyId: input.strategyId,
  }

  if (input.avgCpm > maxCpm) {
    return {
      ...base,
      fired: true,
      severity: 'WARNING',
      title: `CPM elevado: R$${input.avgCpm.toFixed(2)} (máximo: R$${maxCpm})`,
      body: `O CPM médio dos últimos ${input.periodDays} dias foi de R$${input.avgCpm.toFixed(2)}, ` +
        `acima de R$${maxCpm}. Considere ampliar o público-alvo ou revisar o criativo.`,
    }
  }

  return { ...base, fired: false, severity: 'INFO', title: '', body: '' }
}

// ─────────────────────────────────────────────
// evaluateRules() — avalia todas as 4 regras
// ─────────────────────────────────────────────

export function evaluateRules(input: RuleInput): RuleResult[] {
  const results = [
    evaluateRoasRule(input),
    evaluateCpaRule(input),
    evaluateCtrRule(input),
    evaluateCpmRule(input),
  ]
  return results.filter((r) => r.fired)
}
