import { describe, expect, it } from 'vitest'
import { resolveLoopRegion } from '../loopRegion'

const PRIMING = 2112 / 44100

describe('resolveLoopRegion', () => {
  it('uses a valid manifest region as given', () => {
    const r = resolveLoopRegion({ durationSec: 20, loop: { startSec: 0.25, endSec: 20.25 } }, 20.5)
    expect(r).toEqual({ start: 0.25, end: 20.25, mode: 'manifest' })
  })

  it('clamps the manifest end to the buffer', () => {
    const r = resolveLoopRegion({ durationSec: 20, loop: { startSec: 0.25, endSec: 20.25 } }, 20.2)
    expect(r.mode).toBe('manifest')
    expect(r.end).toBe(20.2)
  })

  it('trims the 2112-frame AAC priming of an unpadded file', () => {
    const L = 27.219501
    const r = resolveLoopRegion({ durationSec: L }, L + PRIMING + 700 / 44100)
    expect(r.mode).toBe('trimmed')
    expect(r.start).toBeCloseTo(0.0479, 4)
    expect(r.end - r.start).toBeCloseTo(L, 9)
  })

  it('keeps the start when the decoder already dropped the priming (tail padding only)', () => {
    const L = 22.4
    const r = resolveLoopRegion({ durationSec: L }, L + 900 / 44100)
    expect(r).toEqual({ start: 0, end: L, mode: 'trimmed' })
  })

  it('falls back when the manifest region is invalid', () => {
    const L = 10
    const buf = L + PRIMING
    expect(resolveLoopRegion({ durationSec: L, loop: { startSec: 5, endSec: 4 } }, buf).mode).toBe(
      'trimmed',
    )
    expect(
      resolveLoopRegion({ durationSec: L, loop: { startSec: 0.25, endSec: 9 } }, buf).mode,
    ).toBe('trimmed')
    expect(
      resolveLoopRegion({ durationSec: L, loop: { startSec: 0.25, endSec: 10.25 } }, 0.2).mode,
    ).toBe('whole')
  })

  it('uses the whole buffer when it is shorter than L, exact, or much longer', () => {
    expect(resolveLoopRegion({ durationSec: 10 }, 9.5)).toEqual({
      start: 0,
      end: 9.5,
      mode: 'whole',
    })
    expect(resolveLoopRegion({ durationSec: 10 }, 10)).toEqual({ start: 0, end: 10, mode: 'whole' })
    expect(resolveLoopRegion({ durationSec: 10 }, 10.5).mode).toBe('whole')
  })
})
