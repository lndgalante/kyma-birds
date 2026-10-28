import { describe, expect, it } from 'vitest'
import {
  computeLayout,
  createLayout,
  cubicBezier,
  grainArea,
  grainAlpha,
  hexToRgb,
  shapeEase,
  type LayoutInput,
} from '../gpu/layout'
import { LOOK, TIERS } from '../params'
import { countAllocations } from './helpers'

const base: LayoutInput = {
  wPx: 1280,
  hPx: 1280,
  cssW: 640,
  cssH: 640,
  pixelRatio: 2,
  ext: LOOK.extent.circle,
  shape: 'circle',
  grains: 262144,
  grainCss: TIERS.high.grainCss,
}

describe('computeLayout', () => {
  it('maps plate units to NDC and device pixels (§8.4)', () => {
    const L = computeLayout(base, createLayout())
    expect(L.scaleX).toBeCloseTo(1 / 1.035, 12)
    expect(L.scaleY).toBeCloseTo(1 / 1.035, 12)
    expect(L.pxPerUnit).toBeCloseTo(1280 / (2 * 1.035), 9)
    expect(L.jitter).toBeCloseTo(LOOK.jitterPx / L.pxPerUnit, 12)
  })

  it('keeps the plate round on a non-square canvas', () => {
    const L = computeLayout({ ...base, wPx: 1600, hPx: 800, cssW: 800, cssH: 400 }, createLayout())
    // One plate unit spans the same number of pixels horizontally and vertically.
    expect(L.scaleX * 1600).toBeCloseTo(L.scaleY * 800, 9)
    expect(L.pxPerUnit).toBeCloseTo(800 / (2 * 1.035), 9)
  })

  it('scales grains with DPR and plate size, clamped', () => {
    const at560 = computeLayout({ ...base, cssW: 560, cssH: 560 }, createLayout())
    expect(at560.pointPx).toBeCloseTo(TIERS.high.grainCss * 2, 12)
    const tiny = computeLayout({ ...base, cssW: 100, cssH: 100 }, createLayout())
    expect(tiny.pointPx).toBeCloseTo(TIERS.high.grainCss * 2 * LOOK.grainSizeMin, 12)
    const huge = computeLayout({ ...base, cssW: 3000, cssH: 3000 }, createLayout())
    expect(huge.pointPx).toBeCloseTo(TIERS.high.grainCss * 2 * LOOK.grainSizeMax, 12)
  })

  it('is allocation-free', () => {
    const out = createLayout()
    expect(
      countAllocations(() => {
        for (let i = 0; i < 100; i++) computeLayout({ ...base, ext: 1 + i * 1e-3 }, out)
      }),
    ).toBe(0)
  })
})

describe('grainAlpha (exposure normalisation)', () => {
  const spreadMean = (LOOK.grainAlpha[0] + LOOK.grainAlpha[1]) / 2

  it('an untouched layer averages `coat` grey, independent of DPR and grain count', () => {
    for (const shape of ['circle', 'square'] as const) {
      for (const [grains, pxPerUnit, pointPx] of [
        [262144, 640, 1.8],
        [131072, 400, 1.2],
        [65536, 300, 2.4],
        [262144, 270, 0.8],
      ]) {
        const a = grainAlpha(shape, grains, pxPerUnit, pointPx)
        const area = (shape === 'circle' ? Math.PI : 4) * pxPerUnit ** 2
        const lit = (grains / area) * grainArea(pointPx) * spreadMean
        expect(lit * a).toBeCloseTo(LOOK.coat[shape], 9)
      }
    }
  })

  it('clamps to [alphaMin, 1]', () => {
    expect(grainAlpha('circle', 10, 2000, 1)).toBe(1)
    expect(grainAlpha('square', 1e9, 10, 6)).toBe(LOOK.alphaMin)
  })
})

describe('grainArea', () => {
  it('is exactly one pixel when every grain clamps to the 1 px minimum (1x)', () => {
    expect(grainArea(0.5)).toBe(1)
    expect(grainArea(1 / LOOK.grainSize[1])).toBeCloseTo(1, 12)
  })

  it('averages max(1, size)² over the size spread for hard points (no soft edge below 1.5 px)', () => {
    const [m0, m1] = LOOK.grainSize
    const p = 1.45 / m1 // the largest grain stays hard; the smallest clamp to 1 px
    const ms = Math.min(m1, Math.max(m0, 1 / p)) // where p·m crosses 1 px
    const exact = ((ms - m0) * 1 + (p * p * (m1 ** 3 - ms ** 3)) / 3) / (m1 - m0)
    expect(grainArea(p)).toBeCloseTo(exact, 3)
  })

  it('large soft points light about the inscribed disc of their square', () => {
    const big = grainArea(4 / LOOK.grainSize[0])
    const hard = (4 / LOOK.grainSize[0]) ** 2
    expect(big / hard).toBeGreaterThan(0.6)
    expect(big / hard).toBeLessThan(1)
  })

  it('grows monotonically with point size', () => {
    let prev = 0
    for (let p = 0.5; p < 5; p += 0.05) {
      const a = grainArea(p)
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = a
    }
  })
})

describe('hexToRgb', () => {
  it('parses display-sRGB hex without colour management', () => {
    expect(hexToRgb('#F3EFE6')).toEqual([243 / 255, 239 / 255, 230 / 255])
    expect(hexToRgb('0c0c0e')).toEqual([12 / 255, 12 / 255, 14 / 255])
    expect(hexToRgb('nope')).toEqual([1, 1, 1])
  })
})

describe('cubicBezier', () => {
  it('pins the end points and clamps outside [0, 1]', () => {
    const e = cubicBezier(0.77, 0, 0.175, 1)
    expect(e(0)).toBe(0)
    expect(e(1)).toBe(1)
    expect(e(-1)).toBe(0)
    expect(e(2)).toBe(1)
  })

  it('is monotone and matches the linear and standard CSS curves', () => {
    const lin = cubicBezier(0, 0, 1, 1)
    for (let t = 0; t <= 1; t += 0.05) expect(lin(t)).toBeCloseTo(t, 6)
    // CSS `ease` = cubic-bezier(0.25, 0.1, 0.25, 1); reference values from the browser's solver.
    const ease = cubicBezier(0.25, 0.1, 0.25, 1)
    expect(ease(0.5)).toBeCloseTo(0.8024, 3)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = shapeEase(t)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
    // The shell's in-out curve is slow at both ends.
    expect(shapeEase(0.1)).toBeLessThan(0.05)
    expect(shapeEase(0.9)).toBeGreaterThan(0.95)
  })
})
