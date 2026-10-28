import { describe, expect, it } from 'vitest'
import { Gate } from '../dsp/Gate'

const MS = 0.001

describe('Gate', () => {
  it('opens only after the 20 ms hold and closes only after the 60 ms hold', () => {
    const g = new Gate(0.02, 0.06)
    for (let i = 1; i < 20; i++) expect(g.update(true, false, MS)).toBe(false)
    expect(g.update(true, false, MS)).toBe(true) // 20 ms
    for (let i = 1; i < 60; i++) expect(g.update(false, true, MS)).toBe(true)
    expect(g.update(false, true, MS)).toBe(false) // 60 ms
  })

  it('ignores flutter shorter than the hold times', () => {
    const g = new Gate(0.02, 0.06)
    for (let k = 0; k < 50; k++) {
      for (let i = 0; i < 15; i++) g.update(true, false, MS)
      expect(g.open).toBe(false)
      g.update(false, false, MS)
    }
    for (let i = 0; i < 20; i++) g.update(true, false, MS)
    expect(g.open).toBe(true)
    for (let k = 0; k < 50; k++) {
      for (let i = 0; i < 50; i++) g.update(false, true, MS)
      g.update(true, false, MS) // condition breaks: hold restarts
      expect(g.open).toBe(true)
    }
  })

  it('stays open in the hysteresis zone between the thresholds', () => {
    const g = new Gate(0.02, 0.06)
    for (let i = 0; i < 30; i++) g.update(true, false, MS)
    for (let i = 0; i < 1000; i++) g.update(false, false, MS)
    expect(g.open).toBe(true)
    g.reset()
    expect(g.open).toBe(false)
  })
})
