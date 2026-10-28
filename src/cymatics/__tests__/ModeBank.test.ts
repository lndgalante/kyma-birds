import { describe, expect, it } from 'vitest'
import { createDriveFrame, type DriveFrame } from '~/audio/engine/types'
import { DRIVE, SIM } from '../params'
import { circleBank } from '../physics/banks'
import { lambdaAtRank, makeCalibration, type Calibration } from '../physics/calibration'
import { ModeBank, type FieldDrive } from '../physics/ModeBank'
import { lineResponse } from '../physics/response'
import type { PlateBird } from '../types'
import { countAllocations } from './helpers'

const BAND = { p10: 2346, p50: 3223, p90: 4196 }
const PEAK = 3142
const bird = (symmetry?: 3 | 4 | 5 | 6, id = 'test-bird'): PlateBird => ({
  id,
  bandHz: BAND,
  peakHz: PEAK,
  symmetry,
})
const CAL = makeCalibration(BAND, PEAK)

/** Inverse of Calibration.toRank inside the clamp range. */
function hzAtRank(cal: Calibration, rho: number): number {
  const [x0, x1, x2] = cal.hz.map(Math.log2)
  const [r0, r1, r2] = cal.ranks
  const slope = rho <= r1 ? (r1 - r0) / (x1 - x0) : (r2 - r1) / (x2 - x1)
  return 2 ** (x1 + (rho - r1) / slope)
}

function tone(hz: number, drive = 1): DriveFrame {
  const f = createDriveFrame()
  f.audible = true
  f.voiced = true
  f.tonal = true
  f.drive = drive
  f.f1Hz = hz
  return f
}

function run(
  mb: ModeBank,
  frame: DriveFrame,
  seconds: number,
  hz = 60,
  paused = false,
): FieldDrive {
  let d!: FieldDrive
  const n = Math.round(seconds * hz)
  for (let i = 0; i < n; i++) d = mb.update(frame, 1 / hz, paused)
  return d
}

const HERO_HZ = hzAtRank(CAL, 3)

describe('ModeBank', () => {
  it('makes the hero dominant (> 0.9 of energy) within 0.3 s of a tone at the hero frequency', () => {
    for (const s of [3, 4, 5, 6] as const) {
      const mb = new ModeBank()
      mb.configure('circle', bird(s))
      const d = run(mb, tone(HERO_HZ), 0.3)
      const hero = mb.coefficient(0, DRIVE.hero) ** 2
      expect(hero / d.energy).toBeGreaterThan(0.9)
      expect(d.dominantKey).toBe(`(${s},1)`)
    }
    const mb = new ModeBank()
    mb.configure('square', bird())
    const d = run(mb, tone(HERO_HZ), 0.3)
    expect(mb.coefficient(0, DRIVE.hero) ** 2 / d.energy).toBeGreaterThan(0.9)
    expect(d.dominantKey).toBe('(2,4)')
    expect(d.canMove).toBe(true)
    expect(d.gammaRms).toBeCloseTo(SIM.gMax * Math.sqrt(d.energy), 12)
  })

  it.each([
    ['paused', true, true],
    ['inaudible', false, false],
  ])('%s drives energy below 1e-4 within 1.5 s and stops motion', (_, audible, paused) => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    const f = tone(HERO_HZ)
    f.audible = audible
    const d = run(mb, f, 1.5, 60, paused)
    expect(d.energy).toBeLessThan(1e-4)
    expect(d.canMove).toBe(false)
    // The mode readout is sticky through silence.
    expect(d.dominantKey).toBe('(4,1)')
  })

  it('releases with the gap time constant when the song goes quiet but stays audible', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    const e0 = mb.slotEnergy(0)
    const quiet = tone(HERO_HZ, 0)
    run(mb, quiet, DRIVE.coefReleaseGap)
    expect(mb.slotEnergy(0) / e0).toBeCloseTo(Math.exp(-2), 6)
  })

  it('morphs a new circle family through the other slot; the old one releases with τ 0.6', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    expect(mb.activeSlot).toBe(0)
    const e0 = mb.slotEnergy(0)
    mb.configure('circle', bird(5, 'other'))
    expect(mb.activeSlot).toBe(1)
    expect(mb.slotDef(1)).toBe(circleBank(5))
    expect(mb.slotDef(0)).toBe(circleBank(4))
    const d = run(mb, tone(HERO_HZ), DRIVE.coefReleaseMorph)
    expect(mb.slotEnergy(0) / e0).toBeCloseTo(Math.exp(-2), 6)
    expect(mb.slotEnergy(1)).toBeGreaterThan(0.5)
    expect(d.dominantKey).toBe('(5,1)')
    // Active bank first in the slot arrays: the first slot is a mode of the s5 family.
    expect(d.slots[1] % 5).toBe(0)
    // Same family again → recalibrate only, no slot change.
    mb.configure('circle', bird(5, 'third'))
    expect(mb.activeSlot).toBe(1)
  })

  it('switching back to the family still releasing keeps its envelopes', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    mb.configure('circle', bird(6))
    run(mb, tone(HERO_HZ), 0.1)
    const before = mb.slotEnergy(0)
    mb.configure('circle', bird(4))
    expect(mb.activeSlot).toBe(0)
    expect(mb.slotEnergy(0)).toBe(before)
  })

  it('resets on a shape change', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    mb.configure('square', bird(4))
    expect(mb.configuredShape).toBe('square')
    expect(mb.activeSlot).toBe(0)
    expect(mb.slotEnergy(0)).toBe(0)
    expect(mb.slotEnergy(1)).toBe(0)
    expect(mb.slotDef(1)).toBeNull()
    const d = mb.update(tone(HERO_HZ, 0), 1 / 60, false)
    expect(d.count).toBe(0)
    expect(d.dominantKey).toBeNull()
    // The field still showed the circle: the reset itself must mark it dirty.
    expect(d.dirty).toBe(true)
  })

  // Scatter over a paused plate: the mode the key named is gone until the song drives one again.
  it('silence() clears the dominant and the field but keeps the bank', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    // Paused for a while: the envelopes decay but stay above the dominance floor, the key sticks.
    expect(run(mb, tone(HERO_HZ), 0.5, 60, true).dominantKey).toBe('(4,1)')
    mb.silence()
    expect(mb.slotEnergy(0)).toBe(0)
    expect(mb.slotDef(0)?.key).toBe(circleBank(4).key)
    let d = mb.update(tone(HERO_HZ), 1 / 60, true)
    expect(d.dominantKey).toBeNull()
    expect(d.count).toBe(0)
    expect(d.canMove).toBe(false)
    expect(d.dirty).toBe(true) // the field still showed the pattern
    d = run(mb, tone(HERO_HZ), 1, 60, true)
    expect(d.dominantKey).toBeNull()
    expect(d.dirty).toBe(false)
    expect(run(mb, tone(HERO_HZ), 0.3).dominantKey).toBe('(4,1)')
  })

  it('switches dominance only after 1.3× held for 100 ms', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    expect(mb.update(tone(HERO_HZ), 1 / 60, false).dominantKey).toBe('(4,1)')
    const next = tone(hzAtRank(CAL, 5)) // (4,2)
    const dt = 1 / 60
    let held = 0
    let switchedAt = -1
    for (let i = 0; i < 120 && switchedAt < 0; i++) {
      const d = mb.update(next, dt, false)
      const e3 = mb.coefficient(0, 3) ** 2
      const e5 = mb.coefficient(0, 5) ** 2
      held = e5 >= 1.3 * e3 ? held + dt : 0
      if (d.dominantKey === '(4,2)') switchedAt = held
      else expect(d.dominantKey).toBe('(4,1)')
    }
    expect(switchedAt).toBeGreaterThanOrEqual(0.1 - 1e-9)
    expect(switchedAt).toBeLessThan(0.1 + dt)
  })

  it('a challenger that never reaches 1.3× does not take over', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    run(mb, tone(HERO_HZ), 1)
    // Halfway between (4,1) and (0,3) in rank: both are excited, the hero keeps the lead.
    const d = run(mb, tone(hzAtRank(CAL, 3.3)), 1)
    expect(mb.coefficient(0, 4) ** 2).toBeLessThan(1.3 * mb.coefficient(0, 3) ** 2)
    expect(d.dominantKey).toBe('(4,1)')
  })

  it('envelopes are frame-rate independent (30/60/144 Hz agree within 1e-6 at 1 s)', () => {
    const snap = (hz: number) => {
      const mb = new ModeBank()
      mb.configure('circle', bird(5))
      const f = tone(hzAtRank(CAL, 4.4), 0.8)
      f.f2Hz = hzAtRank(CAL, 7.6)
      f.w2 = 0.5
      run(mb, f, 1, hz)
      const v: number[] = []
      for (let k = 0; k < 12; k++) v.push(mb.coefficient(0, k, 1), mb.coefficient(0, k, 2))
      return v
    }
    const ref = snap(60)
    expect(ref.some((c) => Math.abs(c) > 0.1)).toBe(true)
    for (const hz of [30, 144])
      snap(hz).forEach((c, i) => expect(Math.abs(c - ref[i])).toBeLessThan(1e-6))
  })

  it.each([
    ['s4', 'circle', 4],
    ['s5', 'circle', 5],
    ['square', 'square', undefined],
  ] as const)(
    '%s: sign alignment keeps E ≥ 0.7·G² through a 3 s glide over ranks 1→8',
    (_, shape, s) => {
      const minRatio = (signAlign: boolean) => {
        const mb = new ModeBank({ signAlign })
        mb.configure(shape, bird(s))
        const def = mb.slotDef(0)!
        const unit = new Float64Array(12)
        let worst = Infinity
        const steps = 180
        for (let i = 0; i < steps; i++) {
          const rho = 1 + (7 * i) / (steps - 1)
          const d = mb.update(tone(hzAtRank(CAL, rho)), 1 / 60, false)
          const G = lineResponse(lambdaAtRank(def.logLambda, rho), def, unit)
          if (i >= 30) worst = Math.min(worst, d.energy / (G * G))
        }
        return worst
      }
      expect(minRatio(true)).toBeGreaterThanOrEqual(0.7)
      expect(minRatio(false)).toBeLessThan(0.5)
    },
  )

  it('compacts into ≤ 24 slots, mirrors the bank slot params and allocates nothing per frame', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(3))
    const f = tone(hzAtRank(CAL, 2.5))
    f.f2Hz = hzAtRank(CAL, 6.5)
    f.w2 = 0.6
    run(mb, f, 0.5)
    mb.configure('circle', bird(6))
    let d!: FieldDrive
    const allocs = countAllocations(() => {
      for (let i = 0; i < 30; i++) d = mb.update(f, 1 / 60, false)
    })
    expect(allocs).toBe(0)
    expect(d.count).toBeGreaterThan(12) // both banks are live mid-morph
    expect(d.count).toBeLessThanOrEqual(DRIVE.maxSlots)
    expect(d.slots).toHaveLength(96)
    expect(d.coefs).toHaveLength(48)
    let energy = 0
    let sumAbs = 0
    for (let i = 0; i < d.count; i++) {
      const [row, n, z0, z1] = d.slots.subarray(i * 4, i * 4 + 4)
      expect(z0).toBe(0)
      expect(z1).toBe(0)
      expect(n % 3 === 0 || n % 6 === 0).toBe(true)
      expect(Number.isInteger(row) && row >= 0 && row < 29).toBe(true)
      const c1 = d.coefs[i * 2]
      const c2 = d.coefs[i * 2 + 1]
      expect(Math.abs(c1) + Math.abs(c2)).toBeGreaterThan(DRIVE.slotEps * 0.999)
      energy += c1 * c1 + c2 * c2
      sumAbs += Math.abs(c1) + Math.abs(c2)
    }
    for (let i = d.count * 4; i < 96; i++) expect(d.slots[i]).toBe(0)
    for (let i = d.count * 2; i < 48; i++) expect(d.coefs[i]).toBe(0)
    expect(d.energy).toBeCloseTo(energy, 5)
    expect(d.canMove).toBe(6 * DRIVE.phiMax * sumAbs >= 0.6)
  })

  it('maxDelta tracks change since the last dirty frame, so slow drift still re-renders', () => {
    const mb = new ModeBank()
    mb.configure('circle', bird(4))
    const d0 = run(mb, tone(HERO_HZ), 2)
    // Converged: tiny per-frame change, no re-render needed.
    expect(d0.maxDelta).toBeLessThan(DRIVE.fieldDirtyEps)
    // A slow drive ramp: per-frame changes < eps, but they accumulate and force a dirty frame.
    let dirtyFrames = 0
    let level = 1
    for (let i = 0; i < 120; i++) {
      level -= 5e-5
      const d = mb.update(tone(HERO_HZ, level), 1 / 60, false)
      if (d.dirty) dirtyFrames++
      expect(d.dirty).toBe(d.maxDelta > DRIVE.fieldDirtyEps)
    }
    expect(dirtyFrames).toBeGreaterThan(0)
    expect(dirtyFrames).toBeLessThan(120)
  })

  it('treats bad input as silence', () => {
    const mb = new ModeBank()
    mb.configure('circle', null)
    for (const patch of [{ f1Hz: Number.NaN }, { drive: Number.NaN }, { f1Hz: 0 }, { f1Hz: -3 }]) {
      const d = mb.update(Object.assign(tone(HERO_HZ), patch), 1 / 60, false)
      expect(d.count).toBe(0)
      expect(Number.isFinite(d.energy)).toBe(true)
    }
    const d = mb.update(tone(HERO_HZ), Number.NaN, false)
    expect(d.energy).toBe(0)
    expect(mb.slotDef(0)).toBe(circleBank(DRIVE.defaultSymmetry))
  })
})
