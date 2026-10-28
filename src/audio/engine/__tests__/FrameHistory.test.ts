import { describe, expect, it } from 'vitest'
import { FrameHistory } from '../dsp/FrameHistory'

describe('FrameHistory', () => {
  it('picks the newest entry with time ≤ heard, or the oldest if none', () => {
    const h = new FrameHistory(48, 4)
    expect(h.pick(1)).toBeNull()
    for (let i = 0; i < 10; i++) h.push().time = 1 + i * 0.1
    expect(h.pick(1.45)!.time).toBeCloseTo(1.4, 12)
    expect(h.pick(1.4)!.time).toBeCloseTo(1.4, 12)
    expect(h.pick(9)!.time).toBeCloseTo(1.9, 12)
    expect(h.pick(0.5)!.time).toBe(1) // all newer → oldest
    expect(h.latest()!.time).toBeCloseTo(1.9, 12)
  })

  it('wraps after 48 entries and reuses the spectrum arrays', () => {
    const h = new FrameHistory(48, 8)
    const arrays = new Set(h.frames.map((f) => f.spectrum))
    for (let i = 0; i < 100; i++) {
      const s = h.push()
      s.time = i
      s.spectrum[0] = i
    }
    expect(h.count).toBe(48)
    expect(h.pick(-1)!.time).toBe(52) // oldest surviving
    expect(h.pick(1000)!.time).toBe(99)
    for (const f of h.frames) expect(arrays.has(f.spectrum)).toBe(true)
    expect(h.pick(70)!.spectrum[0]).toBe(70)
  })
})
