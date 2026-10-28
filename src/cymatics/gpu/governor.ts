// Frame-time governor (docs/specs/engine.md §8.2). Three-free and allocation-free per sample.
import { TIERS } from '../params'

export type GovernorConfig = Omit<typeof TIERS.governor, 'maxDowngrades'>

/** Intervals this long are a stall or a wake from sleep, not a measure of load. */
const MAX_INTERVAL_MS = 250

export class Governor {
  private readonly ring: Float64Array
  private readonly scratch: Float64Array
  private n = 0
  private head = 0
  private startMs = 0
  private nextCheckMs = 0
  private strikes = 0

  constructor(private readonly cfg: GovernorConfig = TIERS.governor) {
    this.ring = new Float64Array(cfg.ring)
    this.scratch = new Float64Array(cfg.ring)
  }

  /** Call after every (re)build: clears the history and restarts the warm-up. */
  reset(nowMs: number): void {
    this.n = 0
    this.head = 0
    this.strikes = 0
    this.startMs = nowMs
    this.nextCheckMs = nowMs + this.cfg.warmupSec * 1000
  }

  /**
   * Feed one rAF frame: `intervalMs` since the previous frame (0 when unknown), `stepped` = the sim ran.
   * Returns true when a one-tier downgrade is due; the caller rebuilds and calls reset().
   */
  sample(nowMs: number, intervalMs: number, stepped: boolean): boolean {
    if (nowMs - this.startMs < this.cfg.warmupSec * 1000) return false
    if (stepped && intervalMs > 0 && intervalMs < MAX_INTERVAL_MS) {
      this.ring[this.head] = intervalMs
      this.head = (this.head + 1) % this.ring.length
      if (this.n < this.ring.length) this.n++
    }
    if (nowMs < this.nextCheckMs) return false
    this.nextCheckMs = nowMs + this.cfg.checkSec * 1000
    // A quarter ring is the least history worth judging; idle stretches neither help nor hurt.
    if (this.n < this.ring.length / 4) return false
    if (this.p75() > this.cfg.p75Ms) this.strikes++
    else this.strikes = 0
    // A steady 30 Hz cap (iOS Low Power Mode) is a ceiling, not overload: dropping grains won't lift it.
    return this.strikes >= this.cfg.checks && this.capShare() < this.cfg.capShare
  }

  /** 75th percentile of the recorded intervals (ms), 0 when empty. */
  p75(): number {
    return this.quantile(0.75)
  }

  /** Median interval (ms), 0 when empty. */
  p50(): number {
    return this.quantile(0.5)
  }

  /** Share of recorded intervals inside the 30 Hz cap window [capLo, capHi]. */
  capShare(): number {
    if (this.n === 0) return 0
    let k = 0
    for (let i = 0; i < this.n; i++) {
      const v = this.ring[i]
      if (v >= this.cfg.capLo && v <= this.cfg.capHi) k++
    }
    return k / this.n
  }

  get samples(): number {
    return this.n
  }

  /** Slow checks in a row. */
  get strikeCount(): number {
    return this.strikes
  }

  private quantile(q: number): number {
    const n = this.n
    if (n === 0) return 0
    const a = this.scratch
    for (let i = 0; i < n; i++) a[i] = this.ring[i]
    return select(a, n, Math.min(n - 1, Math.floor(q * n)))
  }
}

/** k-th smallest of a[0..n) by quickselect, in place, no allocation. */
function select(a: Float64Array, n: number, k: number): number {
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) {
        const t = a[i]
        a[i] = a[j]
        a[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return a[k]
  }
  return a[k]
}
