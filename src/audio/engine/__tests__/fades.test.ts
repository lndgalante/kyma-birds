import { describe, expect, it } from 'vitest'
import { dbToGain, FADE_IN, FADE_OUT, FADE_POINTS, volumeTaper } from '../fades'

describe('fades', () => {
  it('starts at 0 and ends at 1', () => {
    expect(FADE_IN.length).toBe(FADE_POINTS)
    expect(FADE_IN[0]).toBe(0)
    expect(FADE_IN[63]).toBe(1)
    expect(FADE_OUT[0]).toBe(1)
    expect(FADE_OUT[63]).toBeCloseTo(0, 7)
  })

  it('is equal power at every point', () => {
    for (let i = 0; i < FADE_POINTS; i++) {
      expect(Math.abs(FADE_IN[i] ** 2 + FADE_OUT[i] ** 2 - 1)).toBeLessThan(1e-6)
    }
  })

  it('is monotonic', () => {
    for (let i = 1; i < FADE_POINTS; i++) {
      expect(FADE_IN[i]).toBeGreaterThan(FADE_IN[i - 1])
      expect(FADE_OUT[i]).toBeLessThan(FADE_OUT[i - 1])
    }
  })

  it('maps dB and volume', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3)
    expect(volumeTaper(0.5)).toBe(0.25)
    expect(volumeTaper(2)).toBe(1)
    expect(volumeTaper(-1)).toBe(0)
  })
})
