import { describe, expect, it } from 'vitest'
import { SIM } from '../params'
import { CIRCLE_MODES, circleRadial, circleRadialSlope } from '../physics/circleTable'
import { LUT_ROWS, bakeRadialLut, sampleRadialLut } from '../physics/radialLut'

const lut = bakeRadialLut()

describe('bakeRadialLut', () => {
  it('is 29 × 1024 × 2 floats, row-major (R, dR/dr)', () => {
    expect(LUT_ROWS).toBe(29)
    expect(SIM.lutWidth).toBe(1024)
    expect(lut).toBeInstanceOf(Float32Array)
    expect(lut.length).toBe(29 * 1024 * 2)
    // Texel (i, row) at offset (row·W + i)·2 holds the profile at r = i/(W−1)·rMax.
    const row = 5
    const i = 700
    const r = (i / 1023) * SIM.lutRMax
    expect(lut[(row * 1024 + i) * 2]).toBeCloseTo(circleRadial(CIRCLE_MODES[row], r), 5)
    expect(lut[(row * 1024 + i) * 2 + 1]).toBeCloseTo(circleRadialSlope(CIRCLE_MODES[row], r), 3)
  })

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))(
    'row %i interpolates to direct evaluation at 4001 radii',
    (k, row) => {
      const out = new Float64Array(2)
      const R = new Float64Array(4001)
      const dR = new Float64Array(4001)
      let maxR = 0
      let maxD = 0
      for (let i = 0; i <= 4000; i++) {
        const r = (i / 4000) * SIM.lutRMax
        R[i] = circleRadial(row, r)
        dR[i] = circleRadialSlope(row, r)
        maxR = Math.max(maxR, Math.abs(R[i]))
        maxD = Math.max(maxD, Math.abs(dR[i]))
      }
      let errR = 0
      let errD = 0
      for (let i = 0; i <= 4000; i++) {
        sampleRadialLut(lut, k, (i / 4000) * SIM.lutRMax, out)
        errR = Math.max(errR, Math.abs(out[0] - R[i]))
        errD = Math.max(errD, Math.abs(out[1] - dR[i]))
      }
      expect(errR).toBeLessThan(1e-4 * maxR)
      expect(errD).toBeLessThan(1e-3 * maxD)
    },
  )

  it('is finite out to r = 1.05 and clamps beyond it', () => {
    for (const v of lut) expect(Number.isFinite(v)).toBe(true)
    const out = new Float64Array(2)
    const atEdge = [...sampleRadialLut(lut, 28, 1.05, out)]
    expect([...sampleRadialLut(lut, 28, 2, out)]).toEqual(atEdge)
  })
})
