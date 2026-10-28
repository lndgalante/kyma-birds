import { describe, expect, it } from 'vitest'
import { besselI, besselIp, besselJ, besselJp } from '../physics/bessel'
import { seeded } from './helpers'

// Appendix C (SciPy).
const J_REF: [number, number, number][] = [
  [0, 1, 0.7651976865579666],
  [1, 1, 0.44005058574493355],
  [5, 10, -0.2340615281867936],
  [12, 20, -0.1189906243103992],
  [3, 23.1, 0.08180241243587395],
  [0, 23.1, -0.15766576894913117],
  [12, 23.1, 0.16764673645324876],
  [4, 0.1, 2.6028648545684057e-7],
]
const I_REF: [number, number, number][] = [
  [0, 1, 1.2660658777520084],
  [3, 5, 10.331150169151138],
  [12, 20, 1211289.700069159],
  [0, 23.1, 898897180.1199746],
  [6, 23.1, 407134814.7676605],
]

describe('besselJ / besselI', () => {
  it.each(J_REF)('J_%i(%f) matches SciPy', (n, x, ref) => {
    const tol = x <= 10 ? 1e-12 : 5e-8
    expect(Math.abs(besselJ(n, x) - ref)).toBeLessThan(tol)
  })

  it.each(I_REF)('I_%i(%f) matches SciPy (relative)', (n, x, ref) => {
    expect(Math.abs(besselI(n, x) - ref) / ref).toBeLessThan(1e-13)
  })

  it('satisfies J_{n−1} + J_{n+1} = (2n/x)·J_n on 1000 seeded points', () => {
    const rnd = seeded(1234)
    let worst = 0
    for (let i = 0; i < 1000; i++) {
      const n = 1 + Math.floor(rnd() * 12)
      const x = 0.5 + rnd() * 19.5
      const lhs = besselJ(n - 1, x) + besselJ(n + 1, x)
      const rhs = ((2 * n) / x) * besselJ(n, x)
      worst = Math.max(worst, Math.abs(lhs - rhs))
    }
    expect(worst).toBeLessThan(1e-7)
  })

  it('J_n(0) = δ_{n0}, I_n(0) = δ_{n0}', () => {
    for (let n = 0; n <= 12; n++) {
      expect(besselJ(n, 0)).toBe(n === 0 ? 1 : 0)
      expect(besselI(n, 0)).toBe(n === 0 ? 1 : 0)
    }
  })

  it('derivatives agree with central differences', () => {
    // x ≤ 12 keeps the series' cancellation noise (÷ 2h) below the tolerance.
    const h = 1e-4
    for (const n of [0, 3, 6, 12]) {
      for (const x of [0.7, 4.2, 11.5]) {
        const dj = (besselJ(n, x + h) - besselJ(n, x - h)) / (2 * h)
        const di = (besselI(n, x + h) - besselI(n, x - h)) / (2 * h)
        expect(Math.abs(besselJp(n, x) - dj)).toBeLessThan(1e-6)
        expect(Math.abs(besselIp(n, x) - di) / Math.abs(di)).toBeLessThan(1e-6)
      }
    }
  })
})
