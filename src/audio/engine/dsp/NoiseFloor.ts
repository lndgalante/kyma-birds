import { ANALYSIS } from '../params'
import { alpha } from './onePole'

/**
 * Per-bin noise floor: falls quickly toward quieter input (τ 0.25 s) and creeps up at +6 dB/s
 * otherwise, so steady hiss is learned within seconds while notes stay above it.
 */
export class NoiseFloor {
  readonly n: Float64Array
  initialized = false

  constructor(bins: number) {
    this.n = new Float64Array(bins)
  }

  reset(p: ArrayLike<number>): void {
    const n = this.n
    for (let b = 0; b < n.length; b++) n[b] = p[b]
    this.initialized = true
  }

  update(p: ArrayLike<number>, dt: number): void {
    const n = this.n
    const fall = alpha(dt, ANALYSIS.floorFallTau)
    const rise = 10 ** ((ANALYSIS.floorRiseDbPerSec / 10) * dt)
    for (let b = 0; b < n.length; b++) {
      const pb = p[b]
      if (pb < n[b]) n[b] += (pb - n[b]) * fall
      else n[b] *= rise
    }
  }
}
