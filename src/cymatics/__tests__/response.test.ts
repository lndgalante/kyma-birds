import { describe, expect, it } from 'vitest'
import { circleBank, squareBank, type PlateBankDef } from '../physics/banks'
import { lineResponse, qFromSpacing } from '../physics/response'
import { countAllocations } from './helpers'

// Appendix B.
const Q_REF: [string, PlateBankDef, number[]][] = [
  ['s3', circleBank(3), [10.0, 10.0, 10.0, 10.0, 10.0, 21.7, 18.1, 15.3, 23.3, 59.2, 41.9, 26.2]],
  ['s4', circleBank(4), [10.0, 10.0, 10.0, 10.0, 10.0, 13.7, 26.9, 16.3, 23.9, 27.0, 23.4, 29.5]],
  ['s5', circleBank(5), [10.0, 10.0, 10.1, 10.0, 13.2, 13.2, 22.0, 58.6, 17.6, 21.9, 66.7, 120.0]],
  ['s6', circleBank(6), [10.0, 10.0, 10.0, 11.8, 11.7, 15.9, 15.1, 25.7, 64.2, 19.7, 23.3, 47.1]],
  [
    'square',
    squareBank(),
    [10.0, 10.0, 10.0, 10.0, 13.3, 30.0, 16.7, 14.4, 26.7, 56.7, 40.0, 33.3],
  ],
]
const BANKS = Q_REF.map(([name, def]) => [name, def] as const)

describe('qFromSpacing', () => {
  it.each(Q_REF)('%s matches Appendix B', (_, def, ref) => {
    const q = qFromSpacing(def.lambda)
    ref.forEach((v, k) => expect(Math.abs(q[k] - v)).toBeLessThanOrEqual(0.1 + 1e-9))
    expect([...def.q]).toEqual([...q])
  })
})

describe('lineResponse', () => {
  it.each(BANKS)('%s: resonance at the hero is pure with G = 1', (_, def) => {
    const out = new Float64Array(12)
    const G = lineResponse(def.lambda[def.hero], def, out)
    expect(G).toBe(1)
    expect(Math.abs(out[def.hero])).toBeGreaterThan(0.98)
    for (let k = 0; k < 12; k++) if (k !== def.hero) expect(Math.abs(out[k])).toBeLessThan(0.15)
  })

  it.each(BANKS)('%s: between hero and hero+1, G ∈ [0.5, 0.9]', (_, def) => {
    const out = new Float64Array(12)
    const nu = Math.sqrt(def.lambda[def.hero] * def.lambda[def.hero + 1])
    const G = lineResponse(nu, def, out)
    expect(G).toBeGreaterThanOrEqual(0.5)
    expect(G).toBeLessThanOrEqual(0.9)
  })

  it.each(BANKS)('%s: unit norm with at most 6 non-zero entries across the band', (_, def) => {
    const out = new Float64Array(12)
    const lo = Math.log(def.lambda[0] * 0.7)
    const hi = Math.log(def.lambda[11] * 1.3)
    for (let s = 0; s <= 400; s++) {
      const G = lineResponse(Math.exp(lo + ((hi - lo) * s) / 400), def, out)
      let n2 = 0
      let nz = 0
      for (let k = 0; k < 12; k++) {
        n2 += out[k] * out[k]
        if (out[k] !== 0) nz++
      }
      expect(Math.abs(Math.sqrt(n2) - 1)).toBeLessThan(1e-12)
      expect(nz).toBeLessThanOrEqual(6)
      expect(G).toBeGreaterThan(0)
      expect(G).toBeLessThanOrEqual(1)
    }
  })

  it('at a pure resonance the projection equals the dominant phase (real part keeps the energy)', () => {
    const def = squareBank()
    const out = new Float64Array(12)
    for (let k = 0; k < 12; k++) {
      lineResponse(def.lambda[k], def, out)
      expect(Math.abs(out[k])).toBeGreaterThan(0.9)
    }
  })

  it('is allocation-free', () => {
    const def = circleBank(5)
    const out = new Float64Array(12)
    lineResponse(100, def, out)
    expect(countAllocations(() => lineResponse(123.4, def, out))).toBe(0)
  })
})
