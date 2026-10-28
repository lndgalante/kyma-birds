import { afterEach, describe, expect, it, vi } from 'vitest'
import { bandWeights, createBandEdges, dbToPow, mad, median, parabolicPeak } from '../dsp/spectral'
import { FFT, windowedToneDb } from './synth'

describe('parabolicPeak', () => {
  it('recovers a Blackman-windowed tone within 0.05 bin', () => {
    for (const pos of [100, 100.1, 100.25, 100.37, 100.5, 100.62, 100.8, 100.93]) {
      const k = Math.round(pos)
      const a = windowedToneDb(pos, k - 1)
      const b = windowedToneDb(pos, k)
      const g = windowedToneDb(pos, k + 1)
      const est = k + parabolicPeak(a, b, g)
      expect(Math.abs(est - pos)).toBeLessThan(0.05)
    }
  })

  it('clamps to ±0.5 and survives a flat top', () => {
    expect(parabolicPeak(0, 0, 0)).toBe(0)
    expect(Math.abs(parabolicPeak(-10, -1, 0))).toBeLessThanOrEqual(0.5)
  })
})

describe('bandWeights', () => {
  const sr = 48000
  const binHz = sr / FFT
  it('is 0 outside [lo, hi] and 1 inside [0.85·p10, 1.25·p90]', () => {
    const w = new Float32Array(FFT / 2)
    const p10 = 2000
    const p90 = 4000
    const e = bandWeights(w, binHz, p10, p90, sr, createBandEdges())
    expect(e.lo).toBe(1250)
    expect(e.hi).toBe(6400)
    for (let b = 0; b < w.length; b++) {
      const f = b * binHz
      if (f <= e.lo || f >= e.hi) expect(w[b]).toBe(0)
      if (f >= 0.85 * p10 && f <= 1.25 * p90) expect(w[b]).toBe(1)
      expect(w[b]).toBeGreaterThanOrEqual(0)
      expect(w[b]).toBeLessThanOrEqual(1)
    }
    expect(w[e.loBin]).toBeGreaterThan(0)
    expect(w[e.loBin - 1]).toBe(0)
    expect(w[e.hiBin]).toBeGreaterThan(0)
    expect(w[e.hiBin + 1]).toBe(0)
  })

  it('caps the band at 12 kHz, 0.45·sr and keeps a very low song finite', () => {
    const w = new Float32Array(FFT / 2)
    const hiBand = bandWeights(w, (22050 / FFT) * 2, 6000, 11000, 22050, createBandEdges())
    expect(hiBand.hi).toBeCloseTo(0.45 * 22050, 6)
    const low = bandWeights(w, binHz, 203, 307, sr, createBandEdges())
    expect(low.loBin).toBeLessThanOrEqual(low.hiBin)
    for (const v of w) expect(Number.isFinite(v)).toBe(true)
    // p10 below the floor: full weight right above `lo`
    expect(Math.max(...w)).toBe(1)
  })
})

describe('median / mad', () => {
  afterEach(() => vi.restoreAllMocks())
  const scratch = new Float64Array(16)

  it('handles odd and even lengths', () => {
    expect(median([5, 1, 3], 3, scratch)).toBe(3)
    expect(median([4, 1, 3, 2], 4, scratch)).toBe(2.5)
    expect(median([7, 1, 3, 100, 100], 3, scratch)).toBe(3) // only the first n
    expect(median([], 0, scratch)).toBe(0)
    // |x − 3| = 2, 2, 0, 1, 97 → sorted 0 1 2 2 97 → 2
    expect(mad([1, 5, 3, 4, 100], 5, 3, scratch)).toBe(2)
    expect(mad([1, 2, 3, 4], 4, 2.5, scratch)).toBe(1)
  })

  it('does not allocate', () => {
    const src = new Float32Array([9, 3, 7, 1, 5, 2, 8])
    const f32 = vi.spyOn(globalThis, 'Float32Array')
    const f64 = vi.spyOn(globalThis, 'Float64Array')
    const arr = vi.spyOn(globalThis, 'Array')
    for (let i = 0; i < 100; i++) {
      const m = median(src, 7, scratch)
      mad(src, 7, m, scratch)
    }
    expect(f32).not.toHaveBeenCalled()
    expect(f64).not.toHaveBeenCalled()
    expect(arr).not.toHaveBeenCalled()
  })
})

describe('dbToPow', () => {
  it('converts power dB', () => {
    expect(dbToPow(10)).toBeCloseTo(10, 12)
    expect(dbToPow(-30)).toBeCloseTo(1e-3, 15)
  })
})
