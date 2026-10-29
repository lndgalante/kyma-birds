import type { CSSProperties } from 'react'
import type { Bird } from './manifest'

export interface Oklch {
  l: number
  c: number
  h: number
}

type Rgb = [number, number, number]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = Number.parseInt(h.slice(0, 6), 16)
  if (!Number.isFinite(n) || h.length < 6) return [0, 0, 0]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function srgbToOklch([r8, g8, b8]: Rgb): Oklch {
  const r = toLinear(r8)
  const g = toLinear(g8)
  const b = toLinear(b8)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(A, B)
  const h = c < 1e-6 ? 0 : (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c, h: (h + 360) % 360 }
}

/** OKLCH → linear sRGB (may fall outside 0..1 when out of gamut). */
function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

export function hexToOklch(hex: string): Oklch {
  return srgbToOklch(hexToRgb(hex))
}

const EPS = 1e-4
function inSrgb(o: Oklch): boolean {
  return oklchToLinear(o).every((v) => v >= -EPS && v <= 1 + EPS)
}

/** Lowers chroma (keeping L and H) until the colour sits inside sRGB. */
export function fitSrgb(o: Oklch): Oklch {
  if (inSrgb(o)) return o
  let lo = 0
  let hi = o.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inSrgb({ ...o, c: mid })) lo = mid
    else hi = mid
  }
  return { ...o, c: lo }
}

export function oklchToHex(o: Oklch): string {
  return `#${oklchToLinear(o)
    .map((v) => Math.round(clamp(toGamma(clamp(v, 0, 1)), 0, 1) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

export function oklchCss({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
}

/** WCAG 2 relative luminance of an OKLCH colour (clipped to sRGB). */
export function luminance(o: Oklch): number {
  const [r, g, b] = oklchToLinear(o).map((v) => clamp(v, 0, 1))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export interface BirdPalette {
  accent: Oklch
  ground: Oklch
  groundRaised: Oklch
  groundSunken: Oklch
  scrim: Oklch
}

const paletteCache = new Map<string, BirdPalette>()

/**
 * The bird's palette (ui.md §4.7): one accent from the photo, clamped light enough to read on
 * any tinted ground, and a ground faintly tinted by the photo's dominant colour.
 */
export function birdPalette(b: Pick<Bird, 'slug' | 'photo'>): BirdPalette {
  const hit = paletteCache.get(b.slug)
  if (hit) return hit
  const dom = hexToOklch(b.photo.dominantColor)
  const acc = hexToOklch(b.photo.accentColor)
  // A grey bird borrows its habitat's hue so the accent still means something.
  const hue = acc.c < 0.03 ? dom.h : acc.h
  const accent = fitSrgb({ l: clamp(acc.l, 0.76, 0.86), c: clamp(acc.c, 0.07, 0.15), h: hue })
  const gc = clamp(dom.c * 0.35, 0.006, 0.03)
  const palette: BirdPalette = {
    accent,
    ground: fitSrgb({ l: 0.19, c: gc, h: dom.h }),
    groundRaised: fitSrgb({ l: 0.23, c: gc, h: dom.h }),
    groundSunken: fitSrgb({ l: 0.155, c: gc * 0.8, h: dom.h }),
    scrim: fitSrgb({ l: 0.14, c: gc, h: dom.h }),
  }
  paletteCache.set(b.slug, palette)
  return palette
}

export function birdTheme(b: Pick<Bird, 'slug' | 'photo'>): CSSProperties {
  const p = birdPalette(b)
  return {
    '--signal': oklchCss(p.accent),
    '--ground': oklchCss(p.ground),
    '--ground-raised': oklchCss(p.groundRaised),
    '--ground-sunken': oklchCss(p.groundSunken),
    '--scrim': oklchCss(p.scrim),
  } as CSSProperties
}

/** The tinted ground as hex, for `<meta name="theme-color">`. */
export function themeColorHex(b: Pick<Bird, 'slug' | 'photo'>): string {
  return oklchToHex(birdPalette(b).ground)
}
