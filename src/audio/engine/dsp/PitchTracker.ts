import { ANALYSIS } from '../params'
import { alpha } from './onePole'
import { median } from './spectral'

/**
 * Syllable-aware drive pitch in the log2 domain. Within a syllable the output leans toward the
 * syllable's running median, so fast trills and vibrato do not drag the plate between modes; a
 * new syllable (gate opening, or a held jump away from the median) starts from the new pitch.
 */
export class PitchTracker {
  /** Drive pitch in Hz; held while unvoiced. 0 until the first voiced frame. */
  f1 = 0
  private ls = 0
  private med = 0
  private wasVoiced = false
  private jumpHeld = 0
  private count = 0
  private readonly times: Float64Array
  private readonly vals: Float64Array
  private readonly scratch: Float64Array

  constructor(capacity: number = ANALYSIS.medianMax) {
    this.times = new Float64Array(capacity)
    this.vals = new Float64Array(capacity)
    this.scratch = new Float64Array(capacity)
  }

  update(f1raw: number, voiced: boolean, t: number, dt: number): number {
    if (!voiced) {
      this.wasVoiced = false
      this.jumpHeld = 0
      return this.f1
    }
    if (!(f1raw > 0)) return this.f1
    const A = ANALYSIS
    const l = Math.log2(f1raw)
    let start = !this.wasVoiced
    this.wasVoiced = true
    // The jump is measured against the syllable median, not ℓs: ℓs chases ℓ with τ 30 ms and
    // would fall back under the 0.5-octave threshold before the 30 ms hold could elapse.
    if (!start && this.count > 0 && Math.abs(l - this.med) > A.pitchJumpOct) {
      this.jumpHeld += dt
      if (this.jumpHeld >= A.pitchJumpHoldSec - 1e-9) start = true
    } else {
      this.jumpHeld = 0
    }
    if (start) {
      this.count = 0
      this.ls = l
      this.jumpHeld = 0
    }
    this.ls += (l - this.ls) * alpha(dt, A.pitchRawTau)
    this.push(t, l)
    const m = median(this.vals, this.count, this.scratch)
    this.med = m
    this.f1 = 2 ** (m + A.glideBeta * (this.ls - m))
    return this.f1
  }

  private push(t: number, l: number): void {
    const { times, vals } = this
    let drop = 0
    while (drop < this.count && t - times[drop] >= ANALYSIS.medianWindowSec) drop++
    if (this.count - drop >= times.length) drop = this.count - times.length + 1
    if (drop > 0) {
      times.copyWithin(0, drop, this.count)
      vals.copyWithin(0, drop, this.count)
      this.count -= drop
    }
    times[this.count] = t
    vals[this.count] = l
    this.count++
  }
}
