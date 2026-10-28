import { describe, expect, it } from 'vitest'
import { alpha, onePole } from '../dsp/onePole'

describe('onePole', () => {
  it('one 16 ms step equals two 8 ms steps', () => {
    for (const tau of [0.025, 0.2, 1]) {
      const one = onePole(0, 1, alpha(0.016, tau))
      const two = onePole(onePole(0, 1, alpha(0.008, tau)), 1, alpha(0.008, tau))
      expect(Math.abs(one - two)).toBeLessThan(1e-12)
    }
  })

  it('30, 60 and 144 Hz reach the same value at 1 s', () => {
    const run = (hz: number) => {
      let y = 0
      const a = alpha(1 / hz, 0.2)
      for (let i = 0; i < hz; i++) y = onePole(y, 1, a)
      return y
    }
    const ref = 1 - Math.exp(-1 / 0.2)
    for (const hz of [30, 60, 144]) expect(Math.abs(run(hz) - ref)).toBeLessThan(1e-9)
  })

  it('treats tau ≤ 0 as an instant step', () => {
    expect(alpha(0.01, 0)).toBe(1)
  })
})
