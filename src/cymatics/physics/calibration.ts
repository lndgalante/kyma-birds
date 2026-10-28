// Bird Hz → bank rank → plate Λ (docs/specs/engine.md §6.6). Three anchors: p10 → rank 1,
// peak → rank 3 (the hero), p90 → rank 7, linear in log2(Hz) on each side of the peak.
import { DRIVE } from '../params'

export interface Band {
  p10: number
  p50: number
  p90: number
}

export interface Calibration {
  readonly hz: readonly [number, number, number]
  readonly ranks: readonly [number, number, number]
  toRank(hz: number): number
}

export function makeCalibration(
  band: Band,
  peakHz: number,
  bankSize: number = DRIVE.bankSize,
  ranks: readonly [number, number, number] = DRIVE.anchors,
): Calibration {
  let { p10, p50, p90 } = band
  if (!(p50 > 0) || !Number.isFinite(p50)) p50 = p10 > 0 && p90 > p10 ? Math.sqrt(p10 * p90) : 3000
  if (!(p10 > 0 && p90 > p10 && Number.isFinite(p10) && Number.isFinite(p90))) {
    p10 = p50 * 2 ** -0.35
    p90 = p50 * 2 ** 0.35
  }
  if (Math.log2(p90 / p10) < 0.4) {
    const mid = Math.log2(p10 * p90) / 2
    p10 = 2 ** (mid - 0.2)
    p90 = 2 ** (mid + 0.2)
  }
  let peak = peakHz >= p10 && peakHz <= p90 && Math.abs(Math.log2(peakHz / p50)) <= 1 ? peakHz : p50
  peak = Math.min(p90 * 2 ** -0.05, Math.max(p10 * 2 ** 0.05, peak))
  const x0 = Math.log2(p10)
  const x1 = Math.log2(peak)
  const x2 = Math.log2(p90)
  const [r0, r1, r2] = ranks
  const sLo = (r1 - r0) / (x1 - x0)
  const sHi = (r2 - r1) / (x2 - x1)
  const lo = -0.45
  const hi = bankSize - 0.55
  return {
    hz: [p10, peak, p90],
    ranks,
    toRank(hz) {
      if (!(hz > 0)) return r1
      const x = Math.log2(hz)
      const rho = x <= x1 ? r1 + (x - x1) * sLo : r1 + (x - x1) * sHi
      return Math.min(hi, Math.max(lo, rho))
    },
  }
}

/** Geometric interpolation of Λ along ranks; extrapolates the edge segment. */
export function lambdaAtRank(logLambda: Float64Array, rho: number): number {
  const n = logLambda.length
  const i = Math.min(n - 2, Math.max(0, Math.floor(rho)))
  const f = rho - i
  return Math.exp(logLambda[i] + f * (logLambda[i + 1] - logLambda[i]))
}
