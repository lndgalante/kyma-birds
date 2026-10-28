// Song line → mode envelopes → GPU slot arrays (docs/specs/engine.md §6.7).
//
// Two bank slots (A/B) let a bird change morph between circle families: the new family attacks in one
// slot while the old one releases in the other. Allocation-free per frame.
import type { DriveFrame } from '~/audio/engine/types'
import { DRIVE, SIM } from '../params'
import type { PlateBird, PlateShape } from '../types'
import { bankFor, PHI_MAX, type PlateBankDef } from './banks'
import { lambdaAtRank, makeCalibration, type Calibration } from './calibration'
import { lineResponse } from './response'

export interface FieldDrive {
  /** Active slots ≤ DRIVE.maxSlots (24). Active bank first, then the releasing one. */
  count: number
  /** maxSlots·4 → `uSlot` (vec4[24]); circle (lutRow, n, 0, 0), square (m, n, k, 0). Entries ≥ count are 0. */
  readonly slots: Float32Array
  /** maxSlots·2 → `uCoef` (vec2[24]); (c1, c2) for lines 1 and 2. Entries ≥ count are 0. */
  readonly coefs: Float32Array
  /** Σ (c1² + c2²) over the slots. */
  energy: number
  /** G_MAX·√energy: plate RMS acceleration in g. */
  gammaRms: number
  /** G_MAX·PHI_MAX·Σ(|c1|+|c2|) ≥ SIM.thetaLo — false means no grain anywhere can lift off. */
  canMove: boolean
  /** Max |Δc| per mode against the coefficients of the last FieldDrive that was `dirty`. */
  maxDelta: number
  /** maxDelta > DRIVE.fieldDirtyEps: the field texture no longer matches; re-render it this frame. */
  dirty: boolean
  /** Dominant mode of the active bank, e.g. '(4,1)'. Sticky through silence; reset/silence() clear it. */
  dominantKey: string | null
}

export interface ModeBankOptions {
  /** Flip each line's target to the envelope's sign (§6.5). Off only to prove it matters in tests. */
  signAlign?: boolean
}

interface BankSlot {
  def: PlateBankDef | null
  cal: Calibration | null
  readonly c1: Float64Array
  readonly c2: Float64Array
  // Coefficients the field was last rendered with (as seen through slot compaction).
  readonly ref1: Float64Array
  readonly ref2: Float64Array
}

const N = DRIVE.bankSize

function makeSlot(): BankSlot {
  return {
    def: null,
    cal: null,
    c1: new Float64Array(N),
    c2: new Float64Array(N),
    ref1: new Float64Array(N),
    ref2: new Float64Array(N),
  }
}

function maxAbs(a: Float64Array): number {
  let m = 0
  for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k]))
  return m
}

export class ModeBank {
  private readonly banks: readonly [BankSlot, BankSlot] = [makeSlot(), makeSlot()]
  private active: 0 | 1 = 0
  private shape: PlateShape | null = null
  private readonly unit = new Float64Array(N)
  private readonly target = new Float64Array(N)
  private readonly signAlign: boolean
  private pendingDelta = 0
  private domIdx = -1
  private candIdx = -1
  private candHeld = 0
  private readonly drive: FieldDrive = {
    count: 0,
    slots: new Float32Array(DRIVE.maxSlots * 4),
    coefs: new Float32Array(DRIVE.maxSlots * 2),
    energy: 0,
    gammaRms: 0,
    canMove: false,
    maxDelta: 0,
    dirty: false,
    dominantKey: null,
  }

  constructor(options: ModeBankOptions = {}) {
    this.signAlign = options.signAlign ?? true
  }

  /** Shape change → reset; new family → morph through the other slot; same family → recalibrate only. */
  configure(shape: PlateShape, bird: PlateBird | null): void {
    const def = bankFor(shape, bird)
    const cal = bird ? makeCalibration(bird.bandHz, bird.peakHz) : makeCalibration(NO_BAND, 0)
    if (shape !== this.shape) {
      this.reset()
      this.shape = shape
      this.banks[0].def = def
      this.banks[0].cal = cal
      this.active = 0
      return
    }
    const cur = this.banks[this.active]
    if (cur.def?.key === def.key) {
      cur.cal = cal
      return
    }
    const nextIdx: 0 | 1 = this.active === 0 ? 1 : 0
    const next = this.banks[nextIdx]
    // Switching back to the family that is still releasing keeps its envelopes (no jump);
    // anything else in that slot is replaced, and the field must drop it at once.
    if (next.def?.key !== def.key) {
      this.pendingDelta = Math.max(this.pendingDelta, maxAbs(next.ref1), maxAbs(next.ref2))
      next.c1.fill(0)
      next.c2.fill(0)
      next.ref1.fill(0)
      next.ref2.fill(0)
      next.def = def
    }
    next.cal = cal
    this.active = nextIdx
    this.domIdx = -1
    this.candIdx = -1
    this.candHeld = 0
  }

  /** Advance the envelopes by `dt` seconds and return the (reused) FieldDrive. Allocation-free. */
  update(frame: DriveFrame, dt: number, paused: boolean): FieldDrive {
    if (!(dt > 0)) dt = 0
    const audible = frame.audible && !paused
    const D = audible ? Math.min(1, Math.max(0, frame.drive)) : 0
    const aAttack = -Math.expm1(-dt / DRIVE.coefAttack)
    for (let b = 0; b < 2; b++) {
      const slot = this.banks[b]
      const def = slot.def
      if (!def) continue
      const isActive = b === this.active
      for (let p = 1; p <= 2; p++) {
        const c = p === 1 ? slot.c1 : slot.c2
        const f = p === 1 ? frame.f1Hz : frame.f2Hz
        const w = p === 1 ? 1 : Math.min(1, frame.w2)
        let driven = false
        if (isActive && audible && D > DRIVE.minDrive && f > 0 && w > 0 && slot.cal) {
          const nu = lambdaAtRank(def.logLambda, slot.cal.toRank(f))
          const amp = w * D * lineResponse(nu, def, this.unit)
          let dot = 0
          for (let k = 0; k < def.size; k++) {
            this.target[k] = amp * this.unit[k]
            dot += this.target[k] * c[k]
          }
          // The global sign is irrelevant to I; aligning it keeps envelopes from crossing zero mid-glide.
          if (this.signAlign && dot < 0)
            for (let k = 0; k < def.size; k++) this.target[k] = -this.target[k]
          driven = true
        } else {
          this.target.fill(0, 0, def.size)
        }
        // The releasing (inactive) slot morphs out slowly; a gap in the song releases faster; a stop fastest.
        const tauRel = !audible
          ? DRIVE.coefReleaseStop
          : !isActive || driven
            ? DRIVE.coefReleaseMorph
            : DRIVE.coefReleaseGap
        const aRelease = -Math.expm1(-dt / tauRel)
        for (let k = 0; k < def.size; k++) {
          const t = this.target[k]
          const a = Math.abs(t) > Math.abs(c[k]) ? aAttack : aRelease
          c[k] += (t - c[k]) * a
        }
      }
    }
    this.compact()
    this.trackDominant(dt)
    return this.drive
  }

  /** Back to silence with no bank: envelopes zero, dominant cleared. The next configure() starts fresh. */
  reset(): void {
    this.silence()
    for (const slot of this.banks) {
      slot.def = null
      slot.cal = null
    }
    this.shape = null
    this.active = 0
  }

  /**
   * Envelopes to zero and the dominant cleared, keeping the banks and calibration: the pattern the
   * key named is gone (sand scattered over a silent plate). The next update() re-renders a zero field.
   */
  silence(): void {
    for (const slot of this.banks) {
      this.pendingDelta = Math.max(this.pendingDelta, maxAbs(slot.ref1), maxAbs(slot.ref2))
      slot.c1.fill(0)
      slot.c2.fill(0)
      slot.ref1.fill(0)
      slot.ref2.fill(0)
    }
    this.domIdx = -1
    this.candIdx = -1
    this.candHeld = 0
    const d = this.drive
    d.count = 0
    d.slots.fill(0)
    d.coefs.fill(0)
    d.energy = 0
    d.gammaRms = 0
    d.canMove = false
    d.maxDelta = 0
    d.dirty = false
    d.dominantKey = null
  }

  /** Index (0/1) of the slot the song currently drives. */
  get activeSlot(): 0 | 1 {
    return this.active
  }

  get configuredShape(): PlateShape | null {
    return this.shape
  }

  /** The bank in slot `i`, or null. */
  slotDef(i: 0 | 1): PlateBankDef | null {
    return this.banks[i].def
  }

  /** Σ (c1² + c2²) of slot `i` before compaction (diagnostics, tests). */
  slotEnergy(i: 0 | 1): number {
    const { c1, c2 } = this.banks[i]
    let e = 0
    for (let k = 0; k < N; k++) e += c1[k] * c1[k] + c2[k] * c2[k]
    return e
  }

  /** Envelope of mode `k`, line `line` (1 | 2), in slot `i`. */
  coefficient(i: 0 | 1, k: number, line: 1 | 2 = 1): number {
    return line === 1 ? this.banks[i].c1[k] : this.banks[i].c2[k]
  }

  private compact(): void {
    const d = this.drive
    const prevCount = d.count
    let count = 0
    let energy = 0
    let sumAbs = 0
    let maxDelta = this.pendingDelta
    for (let pass = 0; pass < 2; pass++) {
      const b = pass === 0 ? this.active : 1 - this.active
      const slot = this.banks[b]
      const def = slot.def
      if (!def) continue
      for (let k = 0; k < def.size; k++) {
        const a1 = slot.c1[k]
        const a2 = slot.c2[k]
        const live = Math.abs(a1) + Math.abs(a2) > DRIVE.slotEps && count < DRIVE.maxSlots
        const v1 = live ? a1 : 0
        const v2 = live ? a2 : 0
        maxDelta = Math.max(maxDelta, Math.abs(v1 - slot.ref1[k]), Math.abs(v2 - slot.ref2[k]))
        if (!live) continue
        const so = count * 4
        const po = k * 4
        d.slots[so] = def.slotParams[po]
        d.slots[so + 1] = def.slotParams[po + 1]
        d.slots[so + 2] = def.slotParams[po + 2]
        d.slots[so + 3] = def.slotParams[po + 3]
        d.coefs[count * 2] = a1
        d.coefs[count * 2 + 1] = a2
        energy += a1 * a1 + a2 * a2
        sumAbs += Math.abs(a1) + Math.abs(a2)
        count++
      }
    }
    if (count < prevCount) {
      d.slots.fill(0, count * 4, prevCount * 4)
      d.coefs.fill(0, count * 2, prevCount * 2)
    }
    const dirty = maxDelta > DRIVE.fieldDirtyEps
    if (dirty) {
      // Re-snapshot what the field will now be rendered with (same compaction rule as above).
      let seen = 0
      for (let pass = 0; pass < 2; pass++) {
        const slot = this.banks[pass === 0 ? this.active : 1 - this.active]
        if (!slot.def) continue
        for (let k = 0; k < slot.def.size; k++) {
          const live =
            Math.abs(slot.c1[k]) + Math.abs(slot.c2[k]) > DRIVE.slotEps && seen < DRIVE.maxSlots
          if (live) seen++
          slot.ref1[k] = live ? slot.c1[k] : 0
          slot.ref2[k] = live ? slot.c2[k] : 0
        }
      }
    }
    this.pendingDelta = 0
    d.count = count
    d.energy = energy
    d.gammaRms = SIM.gMax * Math.sqrt(energy)
    d.canMove = SIM.gMax * PHI_MAX * sumAbs >= SIM.thetaLo
    d.maxDelta = maxDelta
    d.dirty = dirty
  }

  private trackDominant(dt: number): void {
    const slot = this.banks[this.active]
    const def = slot.def
    if (!def) return
    let kMax = -1
    let eMax = 0
    for (let k = 0; k < def.size; k++) {
      const e = slot.c1[k] * slot.c1[k] + slot.c2[k] * slot.c2[k]
      if (e > eMax) {
        eMax = e
        kMax = k
      }
    }
    const cur = this.domIdx
    const eCur = cur >= 0 ? slot.c1[cur] * slot.c1[cur] + slot.c2[cur] * slot.c2[cur] : 0
    if (kMax < 0 || kMax === cur) {
      this.candIdx = -1
      this.candHeld = 0
    } else if (eCur < DRIVE.dominanceFloor) {
      if (eMax > DRIVE.dominanceFloor) this.setDominant(kMax, def)
    } else if (eMax >= DRIVE.dominanceRatio * eCur) {
      if (this.candIdx !== kMax) {
        this.candIdx = kMax
        this.candHeld = 0
      }
      this.candHeld += dt
      if (this.candHeld >= DRIVE.dominanceHoldSec - 1e-9) this.setDominant(kMax, def)
    } else {
      this.candIdx = -1
      this.candHeld = 0
    }
  }

  private setDominant(k: number, def: PlateBankDef): void {
    this.domIdx = k
    this.candIdx = -1
    this.candHeld = 0
    this.drive.dominantKey = def.keys[k]
  }
}

const NO_BAND = { p10: 0, p50: 0, p90: 0 }
