import { describe, expect, it } from 'vitest'
import { heardTime, loopPosition } from '../clock'

const ctx = (o: {
  currentTime: number
  ts?: { contextTime: number; performanceTime: number } | null
  outputLatency?: number
  baseLatency?: number
}) => ({
  currentTime: o.currentTime,
  baseLatency: o.baseLatency ?? 0,
  outputLatency: o.outputLatency,
  getOutputTimestamp:
    o.ts === null ? undefined : () => o.ts ?? { contextTime: 0, performanceTime: 0 },
})

describe('heardTime', () => {
  it('extrapolates a valid output timestamp and clamps it to currentTime', () => {
    const c = ctx({ currentTime: 10.05, ts: { contextTime: 10, performanceTime: 5000 } })
    expect(heardTime(c, 5020)).toBeCloseTo(10.02, 9)
    expect(heardTime(c, 5200)).toBe(10.05)
  })

  it('falls back to outputLatency, then baseLatency, then 0', () => {
    // timestamp of 0
    expect(
      heardTime(ctx({ currentTime: 5, outputLatency: 0.04, baseLatency: 0.01 }), 0),
    ).toBeCloseTo(4.96, 9)
    // stale timestamp (> 0.5 s behind)
    expect(
      heardTime(
        ctx({ currentTime: 5, ts: { contextTime: 4.4, performanceTime: 100 }, baseLatency: 0.01 }),
        200,
      ),
    ).toBeCloseTo(4.99, 9)
    // no method, no latency info
    expect(heardTime(ctx({ currentTime: 5, ts: null }), 0)).toBe(5)
  })

  it('clamps latency to 0.3 s and never goes negative', () => {
    expect(heardTime(ctx({ currentTime: 5, outputLatency: 2 }), 0)).toBeCloseTo(4.7, 9)
    expect(heardTime(ctx({ currentTime: 0.1, outputLatency: 0.2 }), 0)).toBe(0)
  })
})

describe('loopPosition', () => {
  const region = { start: 0.05, end: 10.05 }
  it('is 0 before t0', () => {
    expect(loopPosition(1, 2, region)).toBe(0)
  })
  it('advances and wraps', () => {
    expect(loopPosition(4.5, 2, region)).toBeCloseTo(0.25, 9)
    expect(loopPosition(14.5, 2, region)).toBeCloseTo(0.25, 9)
    expect(loopPosition(12, 2, region)).toBeCloseTo(0, 9)
  })
  it('is 0 for an empty region', () => {
    expect(loopPosition(5, 0, { start: 1, end: 1 })).toBe(0)
  })
})
