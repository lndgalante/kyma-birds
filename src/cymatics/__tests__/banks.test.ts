import { describe, expect, it } from 'vitest'
import { DRIVE } from '../params'
import {
  CIRCLE_FAMILY_ROWS,
  PHI_MAX,
  SQUARE_MODES,
  bankFor,
  circleBank,
  circleFamilyRows,
  fnv1a32,
  squareBank,
  symmetryFor,
  type PlateBankDef,
  type Symmetry,
} from '../physics/banks'
import { CIRCLE_MODES } from '../physics/circleTable'
import { bakeRadialLut, sampleRadialLut } from '../physics/radialLut'

const SYMMETRIES: Symmetry[] = [3, 4, 5, 6]
const lut = bakeRadialLut()

/** Mean of φᵢφⱼ over a G×G midpoint grid of the plate (disk r ≤ 1 for circles, bolt excluded). */
function gram(def: PlateBankDef, G = 512): Float64Array {
  const n = def.size
  const acc = new Float64Array(n * n)
  const phi = new Float64Array(n)
  const R = new Float64Array(2)
  let count = 0
  for (let j = 0; j < G; j++) {
    const y = ((j + 0.5) / G) * 2 - 1
    for (let i = 0; i < G; i++) {
      const x = ((i + 0.5) / G) * 2 - 1
      if (def.shape === 'circle') {
        const r = Math.hypot(x, y)
        if (r > 1) continue
        const th = Math.atan2(y, x) - DRIVE.circleTheta0
        for (let k = 0; k < n; k++) {
          const row = def.slotParams[k * 4]
          const m = def.slotParams[k * 4 + 1]
          phi[k] = sampleRadialLut(lut, row, r, R)[0] * Math.cos(m * th)
        }
      } else {
        const ax = (x + 1) * (Math.PI / 2)
        const ay = (y + 1) * (Math.PI / 2)
        for (let k = 0; k < n; k++) {
          const [m, nn, kk] = def.slotParams.subarray(k * 4, k * 4 + 3)
          phi[k] =
            kk * (Math.cos(m * ax) * Math.cos(nn * ay) + Math.cos(nn * ax) * Math.cos(m * ay))
        }
      }
      count++
      for (let a = 0; a < n; a++) for (let b = a; b < n; b++) acc[a * n + b] += phi[a] * phi[b]
    }
  }
  for (let a = 0; a < n; a++)
    for (let b = a; b < n; b++) acc[b * n + a] = acc[a * n + b] = acc[a * n + b] / count
  return acc
}

describe('circleBank', () => {
  it.each(SYMMETRIES)('s=%i matches the Appendix A rows', (s) => {
    expect(circleFamilyRows(s)).toEqual([...CIRCLE_FAMILY_ROWS[s]])
    const def = circleBank(s)
    expect(def.key).toBe(`circle-s${s}`)
    expect(def.symmetry).toBe(s)
    expect(def.size).toBe(12)
    CIRCLE_FAMILY_ROWS[s].forEach((row, k) => {
      const [n, c, lam, , , P] = CIRCLE_MODES[row]
      expect(def.lambda[k]).toBe(lam * lam)
      expect(def.logLambda[k]).toBeCloseTo(Math.log(lam * lam), 12)
      expect(def.coupling[k]).toBe(P)
      expect([...def.slotParams.subarray(k * 4, k * 4 + 4)]).toEqual([row, n, 0, 0])
      expect(def.keys[k]).toBe(`(${n},${c})`)
    })
  })

  it.each(SYMMETRIES)('s=%i has hero (s,1) at index 3', (s) => {
    const def = circleBank(s)
    expect(def.hero).toBe(3)
    expect(def.keys[def.hero]).toBe(`(${s},1)`)
  })

  it.each(SYMMETRIES)('s=%i keeps only n ≡ 0 (mod s), n ≤ 12, deadR ≤ 0.52', (s) => {
    for (const row of CIRCLE_FAMILY_ROWS[s]) {
      const [n, , , , , , deadR] = CIRCLE_MODES[row]
      expect(n % s).toBe(0)
      expect(n).toBeLessThanOrEqual(12)
      expect(deadR).toBeLessThanOrEqual(0.52)
    }
  })

  it.each(SYMMETRIES)('s=%i modes have RMS 1 (±1 %%) on a 512² grid', (s) => {
    const def = circleBank(s)
    const g = gram(def)
    for (let k = 0; k < def.size; k++) expect(Math.abs(g[k * def.size + k] - 1)).toBeLessThan(0.01)
  })

  it('is memoised', () => {
    expect(circleBank(4)).toBe(circleBank(4))
    expect(squareBank()).toBe(squareBank())
  })
})

describe('squareBank', () => {
  it('matches Appendix A, with P and k by formula', () => {
    const def = squareBank()
    expect(def.key).toBe('square')
    expect(def.symmetry).toBe(0)
    expect(def.hero).toBe(3)
    expect(def.keys[3]).toBe('(2,4)')
    SQUARE_MODES.forEach(([m, n, L, k, P], i) => {
      expect(m % 2).toBe(0)
      expect(n % 2).toBe(0)
      expect(m).toBeLessThanOrEqual(n)
      expect(L).toBe(m * m + n * n)
      expect(k).toBe(m === 0 || m === n ? 1 : Math.SQRT2)
      expect(P).toBeCloseTo(2 * k * (-1) ** ((m + n) / 2), 14)
      expect(def.lambda[i]).toBe(L)
      expect(def.coupling[i]).toBe(P)
      expect(def.slotParams[i * 4]).toBe(m)
      expect(def.slotParams[i * 4 + 1]).toBe(n)
      expect(def.slotParams[i * 4 + 2]).toBe(Math.fround(k))
      expect(def.keys[i]).toBe(`(${m},${n})`)
    })
    expect(def.keys).toEqual([
      '(0,2)',
      '(2,2)',
      '(0,4)',
      '(2,4)',
      '(4,4)',
      '(0,6)',
      '(2,6)',
      '(4,6)',
      '(0,8)',
      '(2,8)',
      '(6,6)',
      '(4,8)',
    ])
  })

  it('is orthonormal on a 512² grid', () => {
    const def = squareBank()
    const g = gram(def)
    for (let a = 0; a < def.size; a++)
      for (let b = 0; b < def.size; b++)
        expect(Math.abs(g[a * def.size + b] - (a === b ? 1 : 0))).toBeLessThan(0.01)
  })
})

describe('PHI_MAX', () => {
  it('bounds |φ| of every bank mode on the plate, tightly', () => {
    const R = new Float64Array(2)
    let worst = 0
    for (const row of new Set(Object.values(CIRCLE_FAMILY_ROWS).flat()))
      for (let i = 0; i <= 2000; i++)
        worst = Math.max(worst, Math.abs(sampleRadialLut(lut, row, i / 2000, R)[0]))
    expect(worst).toBeLessThan(PHI_MAX)
    expect(worst).toBeGreaterThan(0.95 * PHI_MAX)
    for (const [, , , k] of SQUARE_MODES) expect(2 * k).toBeLessThan(PHI_MAX)
  })
})

describe('symmetryFor', () => {
  it('is a deterministic FNV-1a pick and honours the override', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
    const id = 'common-nightingale'
    const s = symmetryFor({ id })
    expect(s).toBe([3, 4, 5, 6][fnv1a32(id) % 4])
    expect(symmetryFor({ id })).toBe(s)
    expect(symmetryFor({ id, symmetry: 5 })).toBe(5)
    expect(symmetryFor(null)).toBe(DRIVE.defaultSymmetry)
  })

  it('bankFor picks the family for circles and the square bank otherwise', () => {
    expect(bankFor('circle', { id: 'x', symmetry: 6 })).toBe(circleBank(6))
    expect(bankFor('square', { id: 'x', symmetry: 6 })).toBe(squareBank())
  })
})
