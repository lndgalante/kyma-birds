import { describe, expect, it } from 'vitest'
import { SIM } from '../params'
import { circleBank, squareBank } from '../physics/banks'
import { CIRCLE_MODES, circleRadial } from '../physics/circleTable'
import { bakeRadialLut } from '../physics/radialLut'
import {
  createFieldGrid,
  createSandState,
  evalField,
  renderField,
  sampleField,
  sandUniforms,
  scatterSand,
  stepSand,
  toHalf,
  type FieldGrid,
  type FieldSlots,
  type SandState,
} from '../physics/sandReference'
import { SubstepAccumulator } from '../physics/substeps'
import type { PlateShape } from '../types'
import { seeded } from './helpers'

const lut = bakeRadialLut()

function slots(entries: [number, number, number, number, number][]): FieldSlots {
  const s = new Float32Array(96)
  const c = new Float32Array(48)
  entries.forEach(([a, b, k, c1, c2], i) => {
    s.set([a, b, k, 0], i * 4)
    c.set([c1, c2], i * 2)
  })
  return { count: entries.length, slots: s, coefs: c }
}

// Circle s = 4 hero (4,1) is LUT row 5; square hero (2,4) has k = √2.
const HERO_41 = slots([[5, 4, 0, 1, 0]])
const ZERO = slots([])

function field(shape: PlateShape, drive: FieldSlots, halfFloat = false): FieldGrid {
  return renderField(createFieldGrid(), drive, { shape, lut, halfFloat })
}

function quietShare(state: SandState, grid: FieldGrid): number {
  const f = new Float64Array(4)
  let q = 0
  const n = state.w * state.h
  for (let i = 0; i < n; i++) {
    sampleField(grid, state.data[i * 4], state.data[i * 4 + 1], f)
    if (SIM.gMax * Math.hypot(f[0], f[1]) < 1) q++
  }
  return q / n
}

function quietArea(grid: FieldGrid): number {
  const f = new Float64Array(4)
  let inside = 0
  let quiet = 0
  for (let j = 0; j < 200; j++)
    for (let i = 0; i < 200; i++) {
      const x = (i + 0.5) / 100 - 1
      const y = (j + 0.5) / 100 - 1
      if (Math.hypot(x, y) > SIM.rim) continue
      inside++
      sampleField(grid, x, y, f)
      if (SIM.gMax * Math.hypot(f[0], f[1]) < 1) quiet++
    }
  return quiet / inside
}

function form(shape: PlateShape, grid: FieldGrid, steps: number, heavyFrac = 0): SandState {
  const state = createSandState(160, 125)
  scatterSand(state, 0, 0, 0, shape)
  for (let k = 1; k <= steps; k++)
    stepSand(state, grid, sandUniforms(shape, { frame: k, heavyFrac }))
  return state
}

describe('evalField (FIELD_FRAG port)', () => {
  it('reproduces φ for a single circle mode, θ0 = π/2 (mirror axis vertical)', () => {
    const out = new Float64Array(4)
    const row = CIRCLE_MODES[5]
    for (const [r, th] of [
      [0.3, 0.2],
      [0.7, 1.9],
      [0.95, -2.4],
    ]) {
      evalField(r * Math.cos(th), r * Math.sin(th), HERO_41, { shape: 'circle', lut }, out)
      expect(out[0]).toBeCloseTo(circleRadial(row, r) * Math.cos(4 * (th - Math.PI / 2)), 4)
      expect(out[1]).toBe(0)
    }
  })

  it.each(['circle', 'square'] as const)(
    '%s: ∇I matches central differences of U1² + U2²',
    (shape) => {
      const drive =
        shape === 'circle'
          ? slots([
              [5, 4, 0, 0.8, 0.1],
              [3, 0, 0, -0.3, 0.4],
              [14, 3, 0, 0.2, -0.2],
            ])
          : slots([
              [2, 4, Math.SQRT2, 0.9, 0.2],
              [0, 4, 1, -0.3, 0.5],
              [4, 4, 1, 0.2, 0],
            ])
      const rnd = seeded(7)
      const f = new Float64Array(4)
      // Reference I from exact Bessel profiles (circle) or the shader itself (square, closed form).
      const I = (x: number, y: number) => {
        if (shape === 'square') {
          evalField(x, y, drive, { shape, lut }, f)
          return f[0] * f[0] + f[1] * f[1]
        }
        const r = Math.hypot(x, y)
        const th = Math.atan2(y, x) - Math.PI / 2
        let u1 = 0
        let u2 = 0
        for (let i = 0; i < drive.count; i++) {
          const row = CIRCLE_MODES[drive.slots[i * 4]]
          const phi = circleRadial(row, r) * Math.cos(drive.slots[i * 4 + 1] * th)
          u1 += drive.coefs[i * 2] * phi
          u2 += drive.coefs[i * 2 + 1] * phi
        }
        return u1 * u1 + u2 * u2
      }
      const h = 1e-6
      for (let i = 0; i < 200; i++) {
        const x = (rnd() * 2 - 1) * 0.98
        const y = (rnd() * 2 - 1) * 0.98
        // The LUT clamps R at r = 1.05 (dR/dr is then meaningless); grains stay inside r ≤ 0.985.
        if (Math.hypot(x, y) < 0.05 || (shape === 'circle' && Math.hypot(x, y) > 0.985)) continue
        const gx = (I(x + h, y) - I(x - h, y)) / (2 * h)
        const gy = (I(x, y + h) - I(x, y - h)) / (2 * h)
        evalField(x, y, drive, { shape, lut }, f)
        const scale = 1 + Math.hypot(gx, gy)
        // Circle: LUT interpolation error of R and dR/dr (≤ 1e-4 / 1e-3 of their maxima).
        expect(Math.abs(f[2] - gx) / scale).toBeLessThan(shape === 'circle' ? 2e-3 : 1e-5)
        expect(Math.abs(f[3] - gy) / scale).toBeLessThan(shape === 'circle' ? 2e-3 : 1e-5)
      }
    },
  )

  it('square bolt zone: U = 0 inside 0.55·r_c, untouched outside r_c', () => {
    const drive = slots([[2, 4, Math.SQRT2, 1, 0]])
    const withBolt = new Float64Array(4)
    const without = new Float64Array(4)
    evalField(0.05, 0.03, drive, { shape: 'square', lut }, withBolt)
    expect(Math.abs(withBolt[0])).toBe(0)
    expect(Math.abs(withBolt[2])).toBe(0)
    evalField(0.3, 0.2, drive, { shape: 'square', lut }, withBolt)
    evalField(0.3, 0.2, drive, { shape: 'square', lut, boltR: 0 }, without)
    expect([...withBolt]).toEqual([...without])
  })

  it('renderField uses GL texel centres, row 0 at y = −ext', () => {
    const grid = field('square', slots([[0, 2, 1, 1, 0]]))
    const f = new Float64Array(4)
    const x = ((3 + 0.5) / 256) * 2.1 - 1.05
    const y = ((250 + 0.5) / 256) * 2.1 - 1.05
    evalField(x, y, slots([[0, 2, 1, 1, 0]]), { shape: 'square', lut }, f)
    const o = (250 * 256 + 3) * 4
    expect(grid.data[o]).toBeCloseTo(f[0], 5)
    // Sampling exactly at a texel centre returns that texel.
    expect(sampleField(grid, x, y, f)[0]).toBe(grid.data[o])
  })
})

describe('stepSand (SAND_STEP_FRAG port)', () => {
  it('circle (4,1) at G = 1: ≥ 80 % of grains are quiet after 60 steps; quiet area ≤ 25 %', () => {
    const grid = field('circle', HERO_41)
    const area = quietArea(grid)
    const state = form('circle', grid, 60)
    const share = quietShare(state, grid)
    expect(area).toBeLessThanOrEqual(0.25)
    expect(share).toBeGreaterThanOrEqual(0.8)
  })

  it('an RGBA16F field (half-float rounding) forms the same pattern', () => {
    const full = field('circle', HERO_41)
    const half = field('circle', HERO_41, true)
    const a = quietShare(form('circle', full, 60), full)
    const b = quietShare(form('circle', half, 60), half)
    expect(Math.abs(a - b)).toBeLessThan(0.02)
  })

  it('gain 0 leaves positions bit-identical after 10 steps', () => {
    const grid = field('circle', HERO_41)
    const state = form('circle', grid, 30)
    const before = state.data.slice()
    const zero = field('circle', ZERO)
    for (let k = 31; k <= 40; k++) stepSand(state, zero, sandUniforms('circle', { frame: k }))
    for (let i = 0; i < state.data.length; i += 4) {
      expect(state.data[i]).toBe(before[i])
      expect(state.data[i + 1]).toBe(before[i + 1])
      expect(state.data[i + 2]).toBe(0)
      expect(state.data[i + 3]).toBe(before[i + 3])
    }
  })

  it.each(['circle', 'square'] as const)('%s: no grain ever leaves the plate', (shape) => {
    const def = shape === 'circle' ? circleBank(5) : squareBank()
    const entries: [number, number, number, number, number][] = []
    for (let k = 0; k < 12; k++) {
      const p = def.slotParams
      entries.push([p[k * 4], p[k * 4 + 1], p[k * 4 + 2], 0.5 * Math.cos(k), 0.3 * Math.sin(k)])
    }
    const grid = field(shape, slots(entries))
    const state = createSandState(160, 125)
    scatterSand(state, 3, 0, 0, shape)
    let worst = 0
    let moved = 0
    for (let k = 1; k <= 120; k++) {
      stepSand(state, grid, sandUniforms(shape, { frame: k, kick: 1.8 }))
      for (let i = 0; i < state.data.length; i += 4) {
        const x = state.data[i]
        const y = state.data[i + 1]
        worst = Math.max(
          worst,
          shape === 'circle' ? Math.hypot(x, y) : Math.max(Math.abs(x), Math.abs(y)),
        )
        if (state.data[i + 2] > 0) moved++
      }
    }
    expect(moved).toBeGreaterThan(100000) // the field is strong: grains really hit the edge
    expect(worst).toBeLessThanOrEqual(shape === 'circle' ? Math.fround(SIM.rim) + 1e-6 : 1)
  })

  it('uTrickle = 0.01 respawns about 1 % of grains per step (χ²)', () => {
    const grid = field('square', ZERO)
    const state = createSandState(160, 125)
    scatterSand(state, 1, 0, 0, 'square')
    const n = 20000
    const p = 0.01
    let chi2 = 0
    let total = 0
    const steps = 20
    for (let k = 1; k <= steps; k++) {
      const got = stepSand(state, grid, sandUniforms('square', { frame: k, clock: k, trickle: p }))
      total += got
      chi2 += (got - n * p) ** 2 / (n * p * (1 - p))
    }
    expect(Math.abs(total / (n * steps) - p)).toBeLessThan(0.001)
    expect(chi2).toBeLessThan(45.3) // χ²(20 dof), p = 0.001
  })

  it('respawned grains fade in from the current clock', () => {
    const grid = field('square', ZERO)
    const state = createSandState(64, 64)
    scatterSand(state, 1, 0, 0, 'square')
    stepSand(state, grid, sandUniforms('square', { frame: 1, clock: 10, trickle: 1 }))
    for (let i = 0; i < state.data.length; i += 4) {
      expect(state.data[i + 3]).toBeGreaterThanOrEqual(10)
      expect(state.data[i + 3]).toBeLessThanOrEqual(10.15 + 1e-6)
    }
  })

  it('scatter is uniform over the plate and pours over `pour` seconds', () => {
    const state = createSandState(128, 128)
    scatterSand(state, 9, 2, 0.6, 'circle')
    let inner = 0
    for (let i = 0; i < state.data.length; i += 4) {
      const r = Math.hypot(state.data[i], state.data[i + 1])
      expect(r).toBeLessThanOrEqual(Math.fround(SIM.rim) + 1e-6)
      if (r < SIM.rim / Math.SQRT2) inner++
      expect(state.data[i + 3]).toBeGreaterThanOrEqual(2)
      expect(state.data[i + 3]).toBeLessThanOrEqual(2.6 + 1e-6)
    }
    expect(Math.abs(inner / (128 * 128) - 0.5)).toBeLessThan(0.02)
  })
})

describe('SubstepAccumulator', () => {
  it.each([30, 60, 120, 144])('%i Hz gives 60 substeps over 1 s (±1)', (hz) => {
    const acc = new SubstepAccumulator()
    let n = 0
    for (let i = 0; i < hz; i++) n += acc.advance(1 / hz)
    expect(Math.abs(n - 60)).toBeLessThanOrEqual(1)
  })

  it('caps at 3 substeps per frame and drops the backlog', () => {
    const acc = new SubstepAccumulator()
    expect(acc.advance(0.1)).toBe(3)
    expect(acc.advance(1 / 60)).toBe(1)
    expect(acc.advance(1 / 120)).toBe(0)
    expect(acc.advance(1 / 120, false)).toBe(0)
    expect(acc.advance(1 / 120)).toBe(0) // the remainder was dropped while inactive
  })
})

describe('toHalf', () => {
  it('rounds to IEEE binary16', () => {
    expect(toHalf(1)).toBe(1)
    expect(toHalf(1 + 2 ** -11)).toBe(1) // tie → even
    expect(toHalf(1 + 3 * 2 ** -11)).toBe(1 + 2 ** -9)
    expect(toHalf(65504)).toBe(65504)
    expect(toHalf(70000)).toBe(Infinity)
    expect(toHalf(-(2 ** -24))).toBe(-(2 ** -24))
    expect(toHalf(0.1)).toBe(0.0999755859375)
  })
})
