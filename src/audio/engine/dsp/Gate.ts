/** Two-threshold hysteresis gate: each transition needs its condition to hold for a minimum time. */
export class Gate {
  open = false
  private held = 0
  private readonly openHoldSec: number
  private readonly closeHoldSec: number

  constructor(openHoldSec: number, closeHoldSec: number) {
    this.openHoldSec = openHoldSec
    this.closeHoldSec = closeHoldSec
  }

  /** The frame's condition is taken to have held for its whole `dt`. Returns `open`. */
  update(openCond: boolean, closeCond: boolean, dt: number): boolean {
    const want = this.open ? closeCond : openCond
    if (!want) {
      this.held = 0
      return this.open
    }
    this.held += dt
    if (this.held >= (this.open ? this.closeHoldSec : this.openHoldSec) - 1e-9) {
      this.open = !this.open
      this.held = 0
    }
    return this.open
  }

  reset(): void {
    this.open = false
    this.held = 0
  }
}
