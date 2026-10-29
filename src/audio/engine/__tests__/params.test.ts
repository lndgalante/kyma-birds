import { describe, expect, it } from 'vitest'
import { ANALYSIS, AUDIO } from '../params'

// Relations between constants that the engine relies on (docs/specs/engine.md §12.1).
describe('params', () => {
  it('suspends only after the pause release has played out', () => {
    // 5 τ is about −43 dB; the margin covers a late audio clock.
    expect(AUDIO.suspendDelayMs).toBeGreaterThanOrEqual(5 * AUDIO.pauseTau * 1000 + 50)
  })

  it('keeps the union band until the old voice has stopped', () => {
    expect(ANALYSIS.bandGlideSec).toBeGreaterThanOrEqual(AUDIO.xfOutSec + AUDIO.stopPadSec)
  })

  it('fades a voice over the cap out quickly, within the stop pad', () => {
    expect(AUDIO.capFadeSec).toBeGreaterThanOrEqual(0.03)
    expect(AUDIO.capFadeSec).toBeLessThanOrEqual(Math.min(0.05, AUDIO.stopPadSec))
  })

  it('keeps mute faster than the pause release', () => {
    expect(AUDIO.muteTau).toBeLessThan(AUDIO.pauseTau / 4)
  })
})
