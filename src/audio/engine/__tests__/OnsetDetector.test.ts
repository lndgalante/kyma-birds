import { describe, expect, it } from 'vitest'
import { OnsetDetector } from '../dsp/OnsetDetector'
import { rng } from './synth'

const BINS = 512
const LO = 50
const HI = 300

const FLOOR = new Float64Array(BINS).fill(1e-9) // −90 dB per-bin noise floor

function run(
  frames: number,
  dt: number,
  fill: (x: Float64Array, i: number) => void,
  voiced: boolean | ((i: number) => boolean) = true,
) {
  const det = new OnsetDetector(BINS)
  const x = new Float64Array(BINS)
  const onsets: number[] = []
  for (let i = 0; i < frames; i++) {
    x.fill(0)
    fill(x, i)
    det.update(x, FLOOR, LO, HI, typeof voiced === 'function' ? voiced(i) : voiced, i * dt, dt)
    if (det.onset === 1) onsets.push(i)
  }
  return { onsets, det }
}

describe('OnsetDetector', () => {
  it('gives one onset per tone burst every 200 ms', () => {
    const dt = 1 / 60
    const { onsets } = run(360, dt, (x, i) => {
      if (i % 12 >= 6) for (let b = 120; b < 126; b++) x[b] = 1e-5
    })
    expect(onsets.length).toBe(30)
    onsets.forEach((f, k) => expect(Math.abs(f - (6 + k * 12))).toBeLessThanOrEqual(1))
  })

  // In the analyzer the detector runs from the first (silent) fade-in frame, so its flux ring is
  // warm long before the gate can open; `warm` mirrors that.
  const warm = (i: number) => i >= 16

  it('gives no onsets on steady noise', () => {
    const rand = rng(3)
    const { onsets } = run(
      600,
      1 / 60,
      (x) => {
        for (let b = LO; b <= HI; b++) x[b] = 1e-6 * -Math.log(1 - rand())
      },
      warm,
    )
    expect(onsets).toEqual([])
  })

  it('respects the 60 ms refractory period', () => {
    const dt = 0.01
    const { onsets } = run(300, dt, (x, i) => {
      if (i % 4 < 2) for (let b = 120; b < 126; b++) x[b] = 1e-5 // bursts every 40 ms
    })
    expect(onsets.length).toBeGreaterThan(10)
    for (let k = 1; k < onsets.length; k++) {
      expect((onsets[k] - onsets[k - 1]) * dt).toBeGreaterThanOrEqual(0.06 - 1e-9)
    }
  })

  it('ignores bins flickering across the cleaning margin', () => {
    // Clean power just above 0 in random bins: noise crossing P > 2N, not attacks.
    const rand = rng(5)
    const { onsets } = run(
      600,
      1 / 60,
      (x) => {
        for (let b = LO; b <= HI; b++) if (rand() < 0.2) x[b] = 1e-9 * rand()
      },
      warm,
    )
    expect(onsets).toEqual([])
  })

  it('fires a pre-gate spike when the gate opens within 100 ms', () => {
    const dt = 1 / 60
    // Note starts at frame 30; the gate opens 3 frames (50 ms) later.
    const fill = (x: Float64Array, i: number) => {
      if (i >= 30) for (let b = 120; b < 126; b++) x[b] = 1e-5
    }
    const late = run(60, dt, fill, (i) => i >= 33)
    expect(late.onsets).toEqual([33])
    // Too late: the gate opens 9 frames (150 ms) after the attack.
    const tooLate = run(60, dt, fill, (i) => i >= 39)
    expect(tooLate.onsets).toEqual([])
  })

  it('stays silent while unvoiced and decays with τ = 90 ms', () => {
    const { onsets } = run(
      60,
      1 / 60,
      (x, i) => {
        if (i % 12 < 6) x[120] = 1e-5
      },
      false,
    )
    expect(onsets).toEqual([])
    const det = new OnsetDetector(BINS)
    det.onset = 1
    det.decay(0.09)
    expect(det.onset).toBeCloseTo(Math.exp(-1), 12)
  })
})
