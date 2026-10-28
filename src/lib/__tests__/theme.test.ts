import { describe, expect, it } from 'vitest'
import { getBirds } from '~/lib/manifest'
import {
  birdPalette,
  birdTheme,
  contrastRatio,
  fitSrgb,
  hexToOklch,
  oklchToHex,
  themeColorHex,
} from '~/lib/theme'

const INK = { l: 0.955, c: 0.008, h: 95 }

describe('theme', () => {
  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#000000', '#ffffff', '#4988b6', '#5a6a4a', '#f5bd2b', '#6e171e']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
    expect(hexToOklch('#fff').l).toBeCloseTo(1, 3)
    expect(hexToOklch('#000').l).toBeCloseTo(0, 3)
  })

  it('fits out-of-gamut colours by lowering chroma only', () => {
    const wild = { l: 0.8, c: 0.4, h: 150 }
    const fit = fitSrgb(wild)
    expect(fit.l).toBe(wild.l)
    expect(fit.h).toBe(wild.h)
    expect(fit.c).toBeLessThan(wild.c)
    expect(fit.c).toBeGreaterThan(0.1)
  })

  it('keeps every bird accent readable on its own grounds (ui.md §4.7)', () => {
    for (const b of getBirds()) {
      const p = birdPalette(b)
      expect(p.accent.l).toBeGreaterThanOrEqual(0.76)
      expect(p.accent.l).toBeLessThanOrEqual(0.86)
      expect(contrastRatio(p.accent, p.ground)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(p.accent, p.groundRaised)).toBeGreaterThanOrEqual(6)
      expect(contrastRatio(INK, p.groundRaised)).toBeGreaterThanOrEqual(12)
      expect(p.ground.c).toBeLessThanOrEqual(0.03)
    }
  })

  it('emits CSS custom properties and a hex theme colour', () => {
    const b = getBirds()[0]
    const style = birdTheme(b) as Record<string, string>
    for (const k of ['--accent', '--ground', '--ground-raised', '--ground-sunken', '--scrim']) {
      expect(style[k]).toMatch(/^oklch\(/)
    }
    expect(themeColorHex(b)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
