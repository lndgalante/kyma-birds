import { describe, expect, it } from 'vitest'
import { NoiseFloor } from '../dsp/NoiseFloor'
import { rng } from './synth'

const BINS = 256
const DT = 1 / 60

function noisePow(out: Float64Array, mean: number, rand: () => number) {
  for (let b = 0; b < out.length; b++) out[b] = mean * -Math.log(1 - rand())
}

const meanDb = (n: Float64Array, from = 0, to = n.length) => {
  let s = 0
  for (let b = from; b < to; b++) s += 10 * Math.log10(n[b])
  return s / (to - from)
}

describe('NoiseFloor', () => {
  it('settles on stationary noise within 10 s, from below or above', () => {
    for (const startDb of [-40, +20]) {
      const rand = rng(7)
      const floor = new NoiseFloor(BINS)
      floor.reset(new Float64Array(BINS).fill(10 ** (startDb / 10)))
      const p = new Float64Array(BINS)
      let at8 = 0
      for (let i = 0; i < 600; i++) {
        noisePow(p, 1, rand)
        floor.update(p, DT)
        if (i === 479) at8 = meanDb(floor.n)
      }
      const at10 = meanDb(floor.n)
      expect(Math.abs(at10 - at8)).toBeLessThan(1)
      // A low-quantile tracker sits a few dB under the mean periodogram power.
      expect(at10).toBeGreaterThan(-8)
      expect(at10).toBeLessThan(2)
    }
  })

  it('keeps more than 14 dB of clean power for a tone 20 dB above the floor for 2 s', () => {
    const rand = rng(11)
    const floor = new NoiseFloor(BINS)
    const p = new Float64Array(BINS)
    noisePow(p, 1, rand)
    floor.reset(p)
    for (let i = 0; i < 600; i++) {
      noisePow(p, 1, rand)
      floor.update(p, DT)
    }
    const toneBin = 100
    for (let i = 0; i < 120; i++) {
      noisePow(p, 1, rand)
      p[toneBin] += 100
      floor.update(p, DT)
    }
    const clean = Math.max(0, p[toneBin] - 2 * floor.n[toneBin])
    expect(10 * Math.log10(clean)).toBeGreaterThan(14)
  })
})
