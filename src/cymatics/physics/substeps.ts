// Fixed-step accumulator for the sand sim (docs/specs/engine.md §7.2, §8.8 step 7).
import { SIM } from '../params'

// Absorbs float error so 30 Hz frames (dt = 2·SIM.dt) always give exactly 2 substeps.
const EPS = 1e-9

export class SubstepAccumulator {
  private acc = 0

  constructor(
    readonly stepSec: number = SIM.dt,
    readonly maxSubsteps: number = SIM.maxSubsteps,
  ) {}

  /**
   * Adds one frame of `frameDt` seconds and returns how many fixed steps to run now.
   * `active = false` (nothing can move) drops the remainder. Hitting the cap drops it too, so a stall
   * never turns into a burst of catch-up steps.
   */
  advance(frameDt: number, active = true): number {
    if (!active || !(frameDt > 0)) {
      if (!active) this.acc = 0
      return 0
    }
    this.acc += frameDt
    let n = 0
    while (this.acc >= this.stepSec - EPS && n < this.maxSubsteps) {
      this.acc -= this.stepSec
      n++
    }
    if (n === this.maxSubsteps || this.acc < 0) this.acc = 0
    return n
  }

  reset(): void {
    this.acc = 0
  }
}
