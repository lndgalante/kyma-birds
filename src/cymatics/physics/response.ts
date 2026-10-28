// Driven, damped mode response to one spectral line, projected in phase (docs/specs/engine.md §6.5).
import { DRIVE } from '../params'

export interface BankModes {
  readonly lambda: Float64Array
  readonly coupling: Float64Array
  readonly q: Float64Array
}

/** Q from local mode spacing: half-power bandwidth = β · local gap. */
export function qFromSpacing(
  lambda: ArrayLike<number>,
  beta: number = DRIVE.beta,
  qMin: number = DRIVE.qMin,
  qMax: number = DRIVE.qMax,
): Float64Array {
  const n = lambda.length
  const q = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const gap =
      k === 0
        ? lambda[1] - lambda[0]
        : k === n - 1
          ? lambda[n - 1] - lambda[n - 2]
          : (lambda[k + 1] - lambda[k - 1]) / 2
    q[k] = Math.min(qMax, Math.max(qMin, lambda[k] / (beta * gap)))
  }
  return q
}

const BANK_MAX = 12
const sRe = new Float64Array(BANK_MAX)
const sIm = new Float64Array(BANK_MAX)
const sMag = new Float64Array(BANK_MAX)
const order = new Int32Array(BANK_MAX)

/**
 * H_k = P_k / (1 − r² + i·r/Q_k), r = ν/Λ_k. Keep the top-K by |H|, rotate by the principal phase
 * φ = ½·arg(Σ H_k²) (the rotation whose real part keeps the most energy; equals arg(H_dom) at a pure resonance),
 * take the real part, normalise to unit norm into `out` (zeros elsewhere).
 * Returns the resonance gain G = min(1, ‖H/(|P|Q)‖_topK)^γ ∈ (0, 1]. The global sign is arbitrary (ModeBank aligns it).
 * Allocation-free; banks hold at most 12 modes.
 */
export function lineResponse(
  nu: number,
  bank: BankModes,
  out: Float64Array,
  topK: number = DRIVE.topK,
  gamma: number = DRIVE.gamma,
): number {
  const n = bank.lambda.length
  for (let k = 0; k < n; k++) {
    const r = nu / bank.lambda[k]
    const a = 1 - r * r
    const b = r / bank.q[k]
    const d = a * a + b * b
    const P = bank.coupling[k]
    sRe[k] = (P * a) / d
    sIm[k] = (-P * b) / d
    sMag[k] = Math.abs(P) / Math.sqrt(d)
    order[k] = k
  }
  const K = Math.min(topK, n)
  for (let i = 0; i < K; i++) {
    let best = i
    for (let j = i + 1; j < n; j++) if (sMag[order[j]] > sMag[order[best]]) best = j
    const t = order[i]
    order[i] = order[best]
    order[best] = t
  }
  let s2r = 0
  let s2i = 0
  for (let i = 0; i < K; i++) {
    const k = order[i]
    s2r += sRe[k] * sRe[k] - sIm[k] * sIm[k]
    s2i += 2 * sRe[k] * sIm[k]
  }
  const ph = 0.5 * Math.atan2(s2i, s2r)
  const cr = Math.cos(ph)
  const si = Math.sin(ph)
  out.fill(0, 0, n)
  let norm2 = 0
  let gn2 = 0
  for (let i = 0; i < K; i++) {
    const k = order[i]
    const v = sRe[k] * cr + sIm[k] * si
    out[k] = v
    norm2 += v * v
    const hn = sMag[k] / (Math.abs(bank.coupling[k]) * bank.q[k])
    gn2 += hn * hn
  }
  const inv = norm2 > 0 ? 1 / Math.sqrt(norm2) : 0
  for (let i = 0; i < K; i++) out[order[i]] *= inv
  return Math.pow(Math.min(1, Math.sqrt(gn2)), gamma)
}
