import { describe, expect, it } from 'vitest'
import { Governor } from '../gpu/governor'
import { TIERS } from '../params'
import { countAllocations } from './helpers'

const G = TIERS.governor

/** Feeds frames of the given intervals (cycled) from `t0` for `sec` seconds; returns when it fired. */
function run(gov: Governor, intervals: number[], sec: number, t0 = 0, stepped = true) {
  let t = t0
  let i = 0
  const fired: number[] = []
  while (t < t0 + sec * 1000) {
    const dt = intervals[i++ % intervals.length]
    t += dt
    if (gov.sample(t, dt, stepped)) fired.push(t)
  }
  return { t, fired }
}

describe('Governor', () => {
  it('never judges during the warm-up', () => {
    const gov = new Governor()
    gov.reset(0)
    const { fired } = run(gov, [50], G.warmupSec - 0.05)
    expect(fired).toEqual([])
    expect(gov.samples).toBe(0)
  })

  // A rebuild long after page load (remount, context restore) gets its own warm-up.
  it('measures the warm-up from the reset, not from time 0', () => {
    const gov = new Governor()
    const t0 = 10_000
    gov.reset(t0)
    const warm = run(gov, [40], G.warmupSec - 0.05, t0)
    expect(warm.fired).toEqual([])
    expect(gov.samples).toBe(0)
    const { fired } = run(gov, [40], 8, warm.t)
    expect(fired.length).toBeGreaterThan(0)
    expect(fired[0] - t0).toBeGreaterThanOrEqual((G.warmupSec + (G.checks - 1) * G.checkSec) * 1000)
  })

  it('downgrades after 4 consecutive slow checks (≈ 2 s past the warm-up)', () => {
    const gov = new Governor()
    gov.reset(0)
    const { fired } = run(gov, [50], 8)
    expect(fired.length).toBeGreaterThan(0)
    const first = fired[0] / 1000
    // Needs a quarter ring of history, then `checks` strikes at checkSec intervals.
    expect(first).toBeGreaterThanOrEqual(G.warmupSec + (G.checks - 1) * G.checkSec)
    expect(first).toBeLessThanOrEqual(G.warmupSec + 3)
  })

  // The cadence measured in Chrome under a 30 Hz cap: mostly 33.3 ms with an occasional 16.7 ms frame.
  it('treats a steady 30 Hz cap as a ceiling, not overload', () => {
    const gov = new Governor()
    gov.reset(0)
    expect(run(gov, [33.3, 33.4, 33.3, 33.3, 33.3, 16.7], 15).fired).toEqual([])
    expect(gov.capShare()).toBeGreaterThanOrEqual(G.capShare)
  })

  it('downgrades an uneven 40 fps (alternating 16.7 / 33.3 ms) — p75 is over budget, no cap', () => {
    const gov = new Governor()
    gov.reset(0)
    expect(run(gov, [16.7, 33.3], 10).fired.length).toBeGreaterThan(0)
  })

  it('leaves a healthy 60 Hz alone and resets strikes when frames recover', () => {
    const gov = new Governor()
    gov.reset(0)
    expect(run(gov, [16.7], 10).fired).toEqual([])
    // Three slow checks, then recovery: the strike count must restart.
    const slow = run(gov, [50], 1.6, 10_000)
    expect(slow.fired).toEqual([])
    run(gov, [16.7], 3, slow.t)
    expect(gov.strikeCount).toBe(0)
  })

  it('ignores frames where the sim did not step and stalls longer than 250 ms', () => {
    const gov = new Governor()
    gov.reset(0)
    expect(run(gov, [50], 10, 0, false).fired).toEqual([])
    expect(gov.samples).toBe(0)
    expect(run(gov, [400], 10, 10_000).fired).toEqual([])
    expect(gov.samples).toBe(0)
  })

  it('p75 is the 75th percentile of the ring', () => {
    const gov = new Governor()
    gov.reset(0)
    let t = G.warmupSec * 1000
    for (let i = 1; i <= 100; i++) gov.sample((t += 1), i, true)
    expect(gov.p75()).toBe(76)
    expect(gov.p50()).toBe(51)
  })

  it('samples without allocating', () => {
    const gov = new Governor()
    gov.reset(0)
    run(gov, [20], 5)
    let t = 5000
    expect(
      countAllocations(() => {
        for (let i = 0; i < 2000; i++) gov.sample((t += 20), 20 + (i % 7), true)
      }),
    ).toBe(0)
  })
})
