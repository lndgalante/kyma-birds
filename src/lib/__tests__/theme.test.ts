import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getBirds } from '~/lib/manifest'
import {
  birdPalette,
  birdTheme,
  contrastRatio,
  fitSrgb,
  hexToOklch,
  hexToRgb,
  oklchToHex,
  themeColorHex,
  type Oklch,
} from '~/lib/theme'

// The tokens as they ship: the first declaration of each is :root's (the contrast-more block
// comes later and only strengthens them).
const TOKENS = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8')

function token(name: string): string {
  const m = TOKENS.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`--${name} is not in tokens.css`)
  return m[1].trim()
}

function colour(name: string): Oklch & { alpha: number } {
  const m = token(name).match(/^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/)
  if (!m) throw new Error(`--${name} is not a plain oklch() colour`)
  const l = Number(m[1]) / (m[2] ? 100 : 1)
  return { l, c: Number(m[3]), h: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 }
}

/** A translucent colour over an opaque one, blended in sRGB as browsers paint it. */
function over(fg: Oklch & { alpha: number }, bg: Oklch): Oklch {
  const f = hexToRgb(oklchToHex(fg))
  const b = hexToRgb(oklchToHex(bg))
  const hex = f
    .map((v, i) => Math.round((v * fg.alpha + b[i] * (1 - fg.alpha)) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
  return hexToOklch(`#${hex}`)
}

const INK = colour('ink')
const TEXT = { ink: INK, 'ink-2': colour('ink-2'), 'ink-3': colour('ink-3') }
const INK_4 = colour('ink-4')
const ON_SIGNAL = colour('on-signal')
const FOCUS_HALO = colour('focus-halo')
// A quiet part's fill (surface.ts PART, the key caps): the ink at 6% over what it rests on.
const PART = { ...INK, alpha: 0.06 }

const NIGHT = {
  ground: colour('night'),
  groundRaised: colour('night-2'),
  groundSunken: colour('night-0'),
}

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

  it('sets the room to a near-neutral night where no bird is themed', () => {
    expect(token('ground')).toBe('var(--night)')
    expect(NIGHT.ground.c).toBeLessThanOrEqual(0.008)
  })

  it('lets each bird’s habitat into a dark, quiet room', () => {
    // An empty manifest would pass every loop below.
    expect(getBirds()).toHaveLength(12)
    for (const b of getBirds()) {
      const p = birdPalette(b)
      const dom = hexToOklch(b.photo.dominantColor)
      expect(p.ground.l, b.slug).toBeGreaterThanOrEqual(0.13)
      expect(p.ground.l, b.slug).toBeLessThanOrEqual(0.16)
      // Visibly the habitat's colour, not the same night for every bird; sRGB caps it near 0.04.
      expect(p.ground.c, b.slug).toBeGreaterThanOrEqual(0.02)
      expect(p.ground.c, b.slug).toBeLessThanOrEqual(0.05)
      // A grey habitat (none yet) would borrow the bird's hue.
      if (dom.c >= 0.008) expect(p.ground.h, b.slug).toBeCloseTo(dom.h, 3)
      // The night's lightness steps.
      expect(p.groundRaised.l - p.ground.l).toBeCloseTo(0.042, 6)
      expect(p.groundSunken.l - p.ground.l).toBeCloseTo(-0.028, 6)
    }
  })

  it('keeps every text step readable on every room, and on the night', () => {
    expect(getBirds()).toHaveLength(12)
    const rooms = [
      ['night', NIGHT] as const,
      ...getBirds().map((b) => [b.slug, birdPalette(b)] as const),
    ]
    for (const [name, room] of rooms) {
      const steps = { ground: room.ground, raised: room.groundRaised, sunken: room.groundSunken }
      for (const [step, bg] of Object.entries(steps)) {
        for (const [ink, fg] of Object.entries(TEXT)) {
          expect(contrastRatio(fg, bg), `${ink} on ${name} ${step}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      // Key caps (ink-2) and part labels (ink) on a part, on the room or on a tooltip.
      for (const bg of [over(PART, room.ground), over(PART, room.groundRaised)]) {
        expect(contrastRatio(TEXT['ink-2'], bg), `ink-2 on a part, ${name}`).toBeGreaterThan(4.5)
      }
      // ink-4 is never text you must read, but it draws parts (the rail's ticks).
      for (const bg of [room.ground, room.groundRaised]) {
        expect(contrastRatio(INK_4, bg), `ink-4 on ${name}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps every bird’s signal readable and its focus ring visible', () => {
    expect(getBirds()).toHaveLength(12)
    for (const b of getBirds()) {
      const p = birdPalette(b)
      expect(p.accent.l).toBeGreaterThanOrEqual(0.76)
      expect(p.accent.l).toBeLessThanOrEqual(0.86)
      // The signal is a part and, on Hold's sunken fill, a label: text contrast throughout.
      for (const bg of [p.ground, p.groundRaised, p.groundSunken]) {
        expect(contrastRatio(p.accent, bg), b.slug).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrastRatio(ON_SIGNAL, p.accent), `on-signal on ${b.slug}`).toBeGreaterThanOrEqual(
        4.5,
      )
      // The focus ring: the signal outside a dark halo, each 2px.
      expect(contrastRatio(p.accent, FOCUS_HALO)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(p.accent, p.ground)).toBeGreaterThanOrEqual(3)
      // Text on the photo's scrim, before its halos.
      expect(contrastRatio(TEXT['ink-2'], p.scrim)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('emits CSS custom properties and the room as the hex theme colour', () => {
    const b = getBirds()[0]
    const style = birdTheme(b) as Record<string, string>
    for (const k of ['--signal', '--ground', '--ground-raised', '--ground-sunken', '--scrim']) {
      expect(style[k]).toMatch(/^oklch\(/)
    }
    for (const bird of getBirds()) {
      expect(themeColorHex(bird)).toBe(oklchToHex(birdPalette(bird).ground))
    }
  })
})
