// Radial LUT for the circle field pass (docs/specs/engine.md §6.8). The GPU never evaluates a Bessel function.
//
// Layout: Float32Array(rows × width × 2), row-major. Texel (i, row) = (R, dR/dr) at r = i/(width − 1)·rMax,
// at offset (row·width + i)·2. Upload as DataTexture(lut, width, rows, RGFormat, FloatType) → RG32F,
// Nearest, flipY false: LUT row k is texture row y = k, so `texelFetch(uLut, ivec2(i, row), 0)`.
import { SIM } from '../params'
import { besselI, besselIp, besselJ, besselJp } from './bessel'
import { CIRCLE_MODES, type CircleModeRow } from './circleTable'

export const LUT_ROWS = CIRCLE_MODES.length

export function bakeRadialLut(
  rows: readonly CircleModeRow[] = CIRCLE_MODES,
  width: number = SIM.lutWidth,
  rMax: number = SIM.lutRMax,
): Float32Array {
  const out = new Float32Array(rows.length * width * 2)
  for (let k = 0; k < rows.length; k++) {
    const [n, , lam, C, N] = rows[k]
    for (let i = 0; i < width; i++) {
      const x = lam * (i / (width - 1)) * rMax
      const o = (k * width + i) * 2
      out[o] = N * (besselJ(n, x) + C * besselI(n, x)) // R(r)
      out[o + 1] = N * lam * (besselJp(n, x) + C * besselIp(n, x)) // dR/dr
    }
  }
  return out
}

/**
 * CPU mirror of FIELD_FRAG's `radial(row, r)`: linear interpolation between texelFetch'd neighbours.
 * Writes (R, dR/dr) into out[0], out[1]. r is clamped to [0, rMax].
 */
export function sampleRadialLut(
  lut: Float32Array,
  row: number,
  r: number,
  out: Float64Array,
  width: number = SIM.lutWidth,
  rMax: number = SIM.lutRMax,
): Float64Array {
  const x = Math.min(1, Math.max(0, r / rMax)) * (width - 1)
  const i0 = Math.min(Math.trunc(x), width - 2)
  const t = x - i0
  const o = (row * width + i0) * 2
  out[0] = lut[o] + (lut[o + 2] - lut[o]) * t
  out[1] = lut[o + 1] + (lut[o + 3] - lut[o + 1]) * t
  return out
}
