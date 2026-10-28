import { describe, expect, it } from 'vitest'
import { PitchTracker } from '../dsp/PitchTracker'

const DT = 1 / 60

describe('PitchTracker', () => {
  it('gives exactly the input for a constant tone', () => {
    const p = new PitchTracker()
    let f = 0
    for (let i = 0; i < 120; i++) f = p.update(3000, true, i * DT, DT)
    expect(f).toBeCloseTo(3000, 6)
  })

  it('lags a sweep within one syllable toward the median (β = 0.35)', () => {
    const p = new PitchTracker()
    let t = 0
    for (let i = 0; i < 30; i++, t += DT) p.update(3000, true, t, DT)
    // 0.25 octave up over 300 ms: never a 0.5-octave jump, so one syllable.
    let f = 0
    let cur = 3000
    const logs: number[] = []
    for (let i = 1; i <= 18; i++, t += DT) {
      cur = 3000 * 2 ** (0.25 * (i / 18))
      logs.push(Math.log2(cur))
      f = p.update(cur, true, t, DT)
    }
    expect(f).toBeLessThan(cur)
    expect(f).toBeGreaterThan(3000)
    // Closer to the syllable median than to the live pitch.
    const window = [...Array(6).fill(Math.log2(3000)), ...logs].slice(-24).sort((a, b) => a - b)
    const med = 2 ** ((window[11] + window[12]) / 2)
    expect(Math.abs(Math.log2(f / med))).toBeLessThan(Math.abs(Math.log2(cur / f)))
  })

  it('resets the syllable on a 0.6-octave jump held for 40 ms', () => {
    const p = new PitchTracker()
    const dt = 0.005
    let t = 0
    for (let i = 0; i < 100; i++, t += dt) p.update(2000, true, t, dt)
    const target = 2000 * 2 ** 0.6
    let f = 0
    for (let i = 0; i < 8; i++, t += dt) f = p.update(target, true, t, dt)
    expect(Math.abs(Math.log2(f / target))).toBeLessThan(0.01)
  })

  it('does not reset on a jump shorter than 30 ms', () => {
    const p = new PitchTracker()
    const dt = 0.005
    let t = 0
    for (let i = 0; i < 100; i++, t += dt) p.update(2000, true, t, dt)
    let f = 0
    for (let i = 0; i < 4; i++, t += dt) f = p.update(2000 * 2 ** 0.6, true, t, dt) // 20 ms
    // Still anchored to the old syllable's median: only the β-weighted fast term moved.
    expect(Math.log2(f / 2000)).toBeLessThan(0.6 * 0.35 + 1e-9)
    for (let i = 0; i < 60; i++, t += dt) f = p.update(2000, true, t, dt)
    expect(Math.abs(f / 2000 - 1)).toBeLessThan(1e-3)
  })

  it('holds the last value while unvoiced and restarts on the next voiced frame', () => {
    const p = new PitchTracker()
    let t = 0
    for (let i = 0; i < 30; i++, t += DT) p.update(1500, true, t, DT)
    for (let i = 0; i < 30; i++, t += DT) expect(p.update(4000, false, t, DT)).toBeCloseTo(1500, 6)
    // The gate opening is a syllable start: no blending with the old median.
    expect(p.update(4000, true, t, DT)).toBeCloseTo(4000, 6)
  })
})
