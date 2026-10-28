// Canvas sizing, grain exposure and easing for the plate (docs/specs/engine.md §8.4, §8.5). Three-free.
import { LOOK } from '../params'
import type { PlateShape } from '../types'

export interface LayoutInput {
  /** Drawing-buffer size in device pixels. */
  wPx: number
  hPx: number
  /** Host size in CSS pixels. */
  cssW: number
  cssH: number
  pixelRatio: number
  /** Render extent: plate units per half canvas (LOOK.extent, eased during a shape change). */
  ext: number
  /** Shape whose area the exposure is normalised over. */
  shape: PlateShape
  grains: number
  grainCss: number
}

export interface PlateLayout {
  /** NDC per plate unit (uScale). */
  scaleX: number
  scaleY: number
  /** Device pixels per plate unit (uPxPerUnit). */
  pxPerUnit: number
  /** Mean grain size in device pixels (uPointPx). */
  pointPx: number
  /** Per-grain alpha so an untouched layer reads as `coat` grey (uAlpha). */
  alpha: number
  /** Hop jitter amplitude in plate units (uJitter, before reduced motion). */
  jitter: number
}

export function createLayout(): PlateLayout {
  return { scaleX: 1, scaleY: 1, pxPerUnit: 1, pointPx: 1, alpha: 0, jitter: 0 }
}

/** Fills `out` (allocation-free). */
export function computeLayout(inp: LayoutInput, out: PlateLayout): PlateLayout {
  const w = Math.max(1, inp.wPx)
  const h = Math.max(1, inp.hPx)
  const ext = inp.ext
  out.scaleX = Math.min(1, h / w) / ext
  out.scaleY = Math.min(1, w / h) / ext
  out.pxPerUnit = Math.min(w, h) / (2 * ext)
  const plateCss = Math.max(1, Math.min(inp.cssW, inp.cssH))
  const sizeGain = Math.min(
    LOOK.grainSizeMax,
    Math.max(LOOK.grainSizeMin, Math.sqrt(plateCss / 560)),
  )
  out.pointPx = inp.grainCss * inp.pixelRatio * sizeGain
  out.alpha = grainAlpha(inp.shape, inp.grains, out.pxPerUnit, out.pointPx)
  out.jitter = LOOK.jitterPx / out.pxPerUnit
  return out
}

/**
 * Exposure normalisation: alpha = coat / (ρ0 · A · ā), with ρ0 grains per device pixel of plate, A the mean
 * pixel area one grain actually lights and ā the mean of its brightness spread. An untouched layer then
 * reads as `coat` grey at every DPR and grain count; lines are ≥ 8× denser, so they saturate to sand white.
 */
export function grainAlpha(
  shape: PlateShape,
  grains: number,
  pxPerUnit: number,
  pointPx: number,
): number {
  const areaPx = (shape === 'circle' ? Math.PI : 4) * pxPerUnit * pxPerUnit
  const rho0 = grains / Math.max(1, areaPx)
  const [a0, a1] = LOOK.grainAlpha
  const lit = rho0 * grainArea(pointPx) * ((a0 + a1) / 2)
  return Math.min(1, Math.max(LOOK.alphaMin, LOOK.coat[shape] / Math.max(1e-9, lit)))
}

const AREA_SAMPLES = 32

/**
 * Mean pixels one grain lights, mirroring GRAIN_VERT/FRAG: size = pointPx·mix(grainSize), drawn as a
 * clamp(size, 1, 6) px square that fades to a disc as vSoft = smoothstep(1.5, 2.5, size) rises.
 * Counting the spread matters: one mean size undercounts 2x by ~2.2× while 1x points clamp to 1 px,
 * which would make the two DPRs differ in brightness.
 */
export function grainArea(pointPx: number): number {
  const [m0, m1] = LOOK.grainSize
  let sum = 0
  for (let i = 0; i < AREA_SAMPLES; i++) {
    const size = pointPx * (m0 + ((m1 - m0) * (i + 0.5)) / AREA_SAMPLES)
    const side = Math.min(6, Math.max(1, size))
    const t = Math.min(1, Math.max(0, size - 1.5))
    const soft = t * t * (3 - 2 * t)
    sum += side * side * (1 - soft * (1 - DISC_FILL))
  }
  return sum / AREA_SAMPLES
}

/** ∫ over the point square of (1 − smoothstep(0.16, 0.25, |d|²)): the soft disc's share of the square. */
const DISC_FILL = (() => {
  const n = 128
  let s = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (i + 0.5) / n - 0.5
      const dy = (j + 0.5) / n - 0.5
      const t = Math.min(1, Math.max(0, (dx * dx + dy * dy - 0.16) / 0.09))
      s += 1 - t * t * (3 - 2 * t)
    }
  }
  return s / (n * n)
})()

/** '#RRGGBB' → display-sRGB components in 0..1 (no colour management: the shaders write sRGB directly). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

/** CSS cubic-bezier(x1, y1, x2, y2) as an easing function of progress t ∈ [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s
  const sy = (s: number) => ((ay * s + by) * s + cy) * s
  const dsx = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  return (t: number) => {
    if (!(t > 0)) return 0
    if (t >= 1) return 1
    // Newton first; bisection when the slope is too flat to trust.
    let s = t
    for (let i = 0; i < 8; i++) {
      const err = sx(s) - t
      if (Math.abs(err) < 1e-7) return sy(s)
      const d = dsx(s)
      if (Math.abs(d) < 1e-6) break
      s -= err / d
    }
    let lo = 0
    let hi = 1
    s = t
    for (let i = 0; i < 40; i++) {
      const x = sx(s)
      if (Math.abs(x - t) < 1e-7) break
      if (x < t) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return sy(s)
  }
}

/** The shell's border-radius easing, shared with the plate's shape morph. */
export const shapeEase = cubicBezier(...LOOK.shapeEase)
