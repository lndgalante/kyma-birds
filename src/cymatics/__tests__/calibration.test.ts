import { describe, expect, it } from 'vitest'
import { squareBank } from '../physics/banks'
import { lambdaAtRank, makeCalibration, type Calibration } from '../physics/calibration'

function expectMonotoneClamped(cal: Calibration) {
  let prev = -Infinity
  for (let i = 0; i <= 600; i++) {
    const hz = 20 * 2 ** (i / 50) // 20 Hz … 81 kHz
    const r = cal.toRank(hz)
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBeGreaterThanOrEqual(prev)
    expect(r).toBeGreaterThanOrEqual(-0.45)
    expect(r).toBeLessThanOrEqual(11.45)
    prev = r
  }
}

describe('makeCalibration', () => {
  it('maps the anchors exactly and is monotone and clamped', () => {
    const cal = makeCalibration({ p10: 2346, p50: 3223, p90: 4196 }, 3142)
    expect(cal.hz).toEqual([2346, 3142, 4196])
    expect(cal.toRank(2346)).toBeCloseTo(1, 12)
    expect(cal.toRank(3142)).toBeCloseTo(3, 12)
    expect(cal.toRank(4196)).toBeCloseTo(7, 12)
    expect(cal.toRank(1)).toBe(-0.45)
    expect(cal.toRank(1e6)).toBe(11.45)
    expectMonotoneClamped(cal)
  })

  it('returns the hero rank for non-positive or NaN Hz', () => {
    const cal = makeCalibration({ p10: 944, p50: 2131, p90: 2576 }, 2224)
    expect(cal.toRank(0)).toBe(3)
    expect(cal.toRank(-5)).toBe(3)
    expect(cal.toRank(Number.NaN)).toBe(3)
  })

  it.each([
    ['all NaN', { p10: NaN, p50: NaN, p90: NaN }, NaN],
    ['all zero', { p10: 0, p50: 0, p90: 0 }, 0],
    ['p10 = p90', { p10: 3000, p50: 3000, p90: 3000 }, 3000],
    ['peak outside band', { p10: 2000, p50: 2500, p90: 3200 }, 9000],
    ['peak > 1 octave from p50', { p10: 1000, p50: 4000, p90: 8000 }, 1100],
    ['p50 outside band', { p10: 1000, p50: 9000, p90: 1100 }, 0],
    ['infinite p90', { p10: 1000, p50: 2000, p90: Infinity }, 2000],
    ['Kākāpō (narrow, peak at the top)', { p10: 203, p50: 305, p90: 307 }, 305],
  ])('%s gives a finite monotone map', (_, band, peak) => {
    const cal = makeCalibration(band, peak)
    for (const v of cal.hz) expect(Number.isFinite(v) && v > 0).toBe(true)
    expect(cal.hz[0]).toBeLessThan(cal.hz[1])
    expect(cal.hz[1]).toBeLessThan(cal.hz[2])
    expectMonotoneClamped(cal)
  })

  it('reproduces the §6.6 worked example (square bank)', () => {
    const cal = makeCalibration({ p10: 2800, p50: 3600, p90: 4600 }, 3700)
    const def = squareBank()
    const rows: [number, number, number][] = [
      [2800, 1.0, 8],
      [3200, 1.958, 15.54],
      [3700, 3.0, 20],
      [4200, 5.329, 37.27],
      [4600, 7.0, 52],
      [6000, 11.45, 83.88],
    ]
    for (const [hz, rank, lambda] of rows) {
      const r = cal.toRank(hz)
      expect(Math.abs(r - rank)).toBeLessThan(1e-3)
      // The table's Λ column is given to 2 decimals.
      expect(Math.abs(lambdaAtRank(def.logLambda, r) - lambda)).toBeLessThan(5e-3)
    }
  })
})

describe('lambdaAtRank', () => {
  it('hits Λ at integer ranks and interpolates geometrically', () => {
    const def = squareBank()
    for (let k = 0; k < 12; k++)
      expect(lambdaAtRank(def.logLambda, k)).toBeCloseTo(def.lambda[k], 10)
    expect(lambdaAtRank(def.logLambda, 3.5)).toBeCloseTo(Math.sqrt(20 * 32), 10)
    // Edge segments extrapolate.
    expect(lambdaAtRank(def.logLambda, -0.45)).toBeCloseTo(4 * (4 / 8) ** 0.45, 10)
    expect(lambdaAtRank(def.logLambda, 11.45)).toBeCloseTo(80 * (80 / 72) ** 0.45, 10)
  })
})
