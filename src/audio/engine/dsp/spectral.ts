import { ANALYSIS } from '../params'

export const dbToPow = (db: number): number => 10 ** (db / 10)

export interface BandEdges {
  lo: number
  hi: number
  loBin: number // first bin with a non-zero weight (inclusive)
  hiBin: number // last bin with a non-zero weight (inclusive)
}

export function createBandEdges(): BandEdges {
  return { lo: 0, hi: 0, loBin: 0, hiBin: -1 }
}

const raisedCos = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)

/**
 * Analysis band weights for a song with spectral-peak percentiles p10/p90: 0 at `lo`, a raised
 * cosine up to 1 at taperLo·p10, flat to taperHi·p90, a raised cosine down to 0 at `hi`.
 * Writes every bin of `out` and returns the band edges in `edges`.
 */
export function bandWeights(
  out: Float32Array,
  binHz: number,
  p10: number,
  p90: number,
  sampleRate: number,
  edges: BandEdges,
): BandEdges {
  const A = ANALYSIS
  const lo = Math.max(A.bandLoMinHz, p10 * A.bandLoFactor)
  const hi = Math.min(A.bandHiMaxHz, 0.45 * sampleRate, p90 * A.bandHiFactor)
  // A very low song (p10 below the floor) has no rising skirt: the flat part starts at `lo`.
  const flatLo = Math.min(hi, Math.max(lo, p10 * A.taperLo))
  const flatHi = Math.max(flatLo, Math.min(hi, p90 * A.taperHi))
  let first = -1
  let last = -1
  for (let b = 0; b < out.length; b++) {
    const f = b * binHz
    let w = 0
    if (f <= lo || f >= hi) w = 0
    else if (f < flatLo) w = raisedCos((f - lo) / (flatLo - lo))
    else if (f <= flatHi) w = 1
    else w = raisedCos((hi - f) / (hi - flatHi))
    out[b] = w
    if (w > 0) {
      if (first < 0) first = b
      last = b
    }
  }
  edges.lo = lo
  edges.hi = hi
  edges.loBin = first < 0 ? 0 : first
  edges.hiBin = last
  return edges
}

/** Sub-bin offset of a peak from three neighbouring dB values, clamped to ±0.5. */
export function parabolicPeak(a: number, b: number, g: number): number {
  const den = a - 2 * b + g
  if (!(Math.abs(den) > 1e-12)) return 0
  const d = (0.5 * (a - g)) / den
  return d > 0.5 ? 0.5 : d < -0.5 ? -0.5 : d
}

/** Sorts the first n values of `src` into `scratch` (insertion sort; n is small). */
function sortedCopy(src: ArrayLike<number>, n: number, scratch: Float32Array | Float64Array) {
  for (let i = 0; i < n; i++) {
    const v = src[i]
    let j = i - 1
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j]
      j--
    }
    scratch[j + 1] = v
  }
}

function medianOfSorted(s: Float32Array | Float64Array, n: number): number {
  const h = n >> 1
  return n % 2 === 1 ? s[h] : 0.5 * (s[h - 1] + s[h])
}

/** Median of the first n values of `src`. `scratch` must hold at least n values. No allocation. */
export function median(
  src: ArrayLike<number>,
  n: number,
  scratch: Float32Array | Float64Array,
): number {
  if (n <= 0) return 0
  sortedCopy(src, n, scratch)
  return medianOfSorted(scratch, n)
}

/** Median absolute deviation of the first n values of `src` around `med`. No allocation. */
export function mad(
  src: ArrayLike<number>,
  n: number,
  med: number,
  scratch: Float32Array | Float64Array,
): number {
  if (n <= 0) return 0
  for (let i = 0; i < n; i++) {
    const v = Math.abs(src[i] - med)
    let j = i - 1
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j]
      j--
    }
    scratch[j + 1] = v
  }
  return medianOfSorted(scratch, n)
}
