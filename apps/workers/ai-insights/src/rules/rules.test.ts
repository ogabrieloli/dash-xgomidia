/**
 * Testes unitários do Rules Engine.
 * Funções puras — sem banco, sem rede.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateRoasRule,
  evaluateCpaRule,
  evaluateCtrRule,
  evaluateCpmRule,
  evaluateRules,
  type RuleInput,
} from './index.js'

function makeInput(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    adAccountId: 'acc-1',
    clientId: 'client-1',
    periodDays: 7,
    avgRoas: 2.5,
    avgCpa: 30,
    avgCtr: 2.0,
    avgCpm: 15,
    totalSpend: 1000,
    thresholds: {},
    ...overrides,
  }
}

describe('Rules Engine', () => {

  // ─────────────────────────────────────────────
  // ROAS
  // ─────────────────────────────────────────────

  describe('evaluateRoasRule()', () => {
    it('não dispara quando ROAS está acima do mínimo', () => {
      const result = evaluateRoasRule(makeInput({ avgRoas: 3.0 }))
      expect(result.fired).toBe(false)
    })

    it('dispara WARNING quando ROAS está entre 1 e o mínimo configurado', () => {
      const result = evaluateRoasRule(makeInput({
        avgRoas: 1.5,
        thresholds: { minRoas: 2.0 },
      }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('WARNING')
    })

    it('dispara CRITICAL quando ROAS está abaixo de 1 (prejuízo)', () => {
      const result = evaluateRoasRule(makeInput({ avgRoas: 0.7 }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('CRITICAL')
      expect(result.title).toContain('ROAS')
    })

    it('usa threshold padrão de 1.5 quando não configurado', () => {
      const belowDefault = evaluateRoasRule(makeInput({ avgRoas: 1.2 }))
      const aboveDefault = evaluateRoasRule(makeInput({ avgRoas: 1.8 }))
      expect(belowDefault.fired).toBe(true)
      expect(aboveDefault.fired).toBe(false)
    })
  })

  // ─────────────────────────────────────────────
  // CPA
  // ─────────────────────────────────────────────

  describe('evaluateCpaRule()', () => {
    it('não dispara quando CPA está abaixo do máximo', () => {
      const result = evaluateCpaRule(makeInput({ avgCpa: 25, thresholds: { maxCpa: 50 } }))
      expect(result.fired).toBe(false)
    })

    it('dispara WARNING quando CPA ultrapassa o limite configurado', () => {
      const result = evaluateCpaRule(makeInput({
        avgCpa: 75,
        thresholds: { maxCpa: 50 },
      }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('WARNING')
      expect(result.title).toContain('CPA')
    })

    it('dispara CRITICAL quando CPA é mais que 2x o limite', () => {
      const result = evaluateCpaRule(makeInput({
        avgCpa: 120,
        thresholds: { maxCpa: 50 },
      }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('CRITICAL')
    })

    it('não dispara quando maxCpa não está configurado', () => {
      // Sem threshold configurado, a regra de CPA não deve gerar alertas
      const result = evaluateCpaRule(makeInput({ avgCpa: 9999, thresholds: {} }))
      expect(result.fired).toBe(false)
    })
  })

  // ─────────────────────────────────────────────
  // CTR
  // ─────────────────────────────────────────────

  describe('evaluateCtrRule()', () => {
    it('não dispara quando CTR está acima do mínimo', () => {
      const result = evaluateCtrRule(makeInput({ avgCtr: 2.5 }))
      expect(result.fired).toBe(false)
    })

    it('dispara WARNING quando CTR está abaixo do threshold padrão (1%)', () => {
      const result = evaluateCtrRule(makeInput({ avgCtr: 0.5 }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('WARNING')
      expect(result.title).toContain('CTR')
    })

    it('usa threshold customizado quando configurado', () => {
      const result = evaluateCtrRule(makeInput({
        avgCtr: 1.5,
        thresholds: { minCtr: 2.0 },
      }))
      expect(result.fired).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // CPM
  // ─────────────────────────────────────────────

  describe('evaluateCpmRule()', () => {
    it('não dispara quando CPM está abaixo do máximo', () => {
      const result = evaluateCpmRule(makeInput({ avgCpm: 20, thresholds: { maxCpm: 40 } }))
      expect(result.fired).toBe(false)
    })

    it('dispara WARNING quando CPM ultrapassa o threshold padrão', () => {
      const result = evaluateCpmRule(makeInput({ avgCpm: 55 }))
      expect(result.fired).toBe(true)
      expect(result.severity).toBe('WARNING')
      expect(result.title).toContain('CPM')
    })
  })

  // ─────────────────────────────────────────────
  // evaluateRules() — avalia todas as regras
  // ─────────────────────────────────────────────

  describe('evaluateRules()', () => {
    it('retorna lista vazia quando nenhuma regra dispara', () => {
      const results = evaluateRules(makeInput({
        avgRoas: 4.0,
        avgCpa: 20,
        avgCtr: 3.0,
        avgCpm: 10,
        thresholds: { maxCpa: 50 },
      }))
      expect(results).toHaveLength(0)
    })

    it('retorna múltiplos insights quando múltiplas regras disparam', () => {
      const results = evaluateRules(makeInput({
        avgRoas: 0.5,   // CRITICAL
        avgCpa: 200,    // CRITICAL (4x maxCpa)
        avgCtr: 0.3,    // WARNING
        avgCpm: 80,     // WARNING
        thresholds: { maxCpa: 50 },
      }))
      expect(results.length).toBeGreaterThanOrEqual(4)
    })

    it('inclui adAccountId e clientId em cada resultado', () => {
      const results = evaluateRules(makeInput({ avgRoas: 0.5 }))
      expect(results.length).toBeGreaterThan(0)
      results.forEach((r) => {
        expect(r.adAccountId).toBe('acc-1')
        expect(r.clientId).toBe('client-1')
      })
    })
  })
})
