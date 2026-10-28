import { ANALYSIS } from '../params'
import { mad, median } from './spectral'

const EPS = 1e-12

/** Spectral-flux onsets with an adaptive threshold (median + k·MAD of recent flux). */
export class OnsetDetector {
  /** Pulse: 1 on an onset, then decays with τ = onsetDecay. */
  onset = 0
  /** Last frame's flux and threshold in dB (debug). */
  flux = 0
  threshold = 0
  private readonly prevL: Float32Array
  private readonly ring: Float32Array
  private readonly scratch: Float32Array
  private head = 0
  private count = 0
  private lastOnset = -Infinity
  private pendingAt = -Infinity
  private primed = false

  constructor(bins: number, ringSize: number = ANALYSIS.onsetRing) {
    this.prevL = new Float32Array(bins).fill(10 * Math.log10(EPS))
    this.ring = new Float32Array(ringSize)
    this.scratch = new Float32Array(ringSize)
  }

  /**
   * `x` is clean band power (0 outside the band), `floor` the per-bin noise floor it was
   * cleaned against. Returns the onset pulse.
   */
  update(
    x: ArrayLike<number>,
    floor: ArrayLike<number>,
    loBin: number,
    hiBin: number,
    voiced: boolean,
    t: number,
    dt: number,
  ): number {
    const A = ANALYSIS
    const prevL = this.prevL
    let sum = 0
    let n = 0
    for (let b = 0; b < prevL.length; b++) {
      const xb = x[b]
      // Level re the bin's own noise floor: a bin hovering at the floor reads ~0 dB of change
      // instead of jumping from −120 dBFS every time it crosses the cleaning margin.
      const L = 10 * Math.log10(xb + floor[b] + EPS)
      if (xb > 0 && b >= loBin && b <= hiBin) {
        const d = L - prevL[b]
        if (d > 0) sum += d
        n++
      }
      prevL[b] = L
    }
    // The first frame only primes prevL: there is no "before" to compare with.
    const flux = n > 0 && this.primed ? sum / n : 0
    this.primed = true
    this.flux = flux

    let thr = A.onsetBiasDb
    if (this.count > 0) {
      const med = median(this.ring, this.count, this.scratch)
      thr = med + A.onsetMadK * mad(this.ring, this.count, med, this.scratch) + A.onsetBiasDb
    }
    this.threshold = thr
    this.ring[this.head] = flux
    this.head = (this.head + 1) % this.ring.length
    if (this.count < this.ring.length) this.count++

    // An attack usually peaks a frame or two before the gate's 20 ms hold lets it open, so a
    // spike while unvoiced stays pending and fires when the gate opens shortly after.
    const spike = flux > thr
    if (spike && !voiced) this.pendingAt = t
    const pending = t - this.pendingAt <= A.onsetPendingSec + 1e-9
    if (voiced && (spike || pending) && t - this.lastOnset >= A.onsetRefractorySec - 1e-9) {
      this.onset = 1
      this.lastOnset = t
      this.pendingAt = -Infinity
    } else {
      this.decay(dt)
    }
    return this.onset
  }

  decay(dt: number): void {
    this.onset *= Math.exp(-dt / ANALYSIS.onsetDecay)
  }
}
