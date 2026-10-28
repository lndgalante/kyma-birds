import { describe, expect, it } from 'vitest'
import { describeMode } from '../describeMode'

describe('describeMode', () => {
  it.each([
    ['circle', '(0,2)', 'Mode (0, 2): 2 nodal circles, no nodal diameters.'],
    ['circle', '(4,1)', 'Mode (4, 1): 4 nodal diameters and 1 nodal circle.'],
    ['circle', '(1,0)', 'Mode (1, 0): 1 nodal diameter and no nodal circles.'],
    ['square', '(0,2)', 'Mode (0, 2): 2 half-waves across the plate, in both directions at once.'],
    [
      'square',
      '(2,4)',
      'Mode (2, 4): 2 and 4 half-waves across the plate, in both directions at once.',
    ],
    ['square', '(4,4)', 'Mode (4, 4): 4 half-waves along each side.'],
  ] as const)('%s %s', (shape, key, text) => {
    expect(describeMode(shape, key)).toBe(text)
  })

  it('falls back on malformed keys', () => {
    expect(describeMode('circle', '4,1')).toBe('Mode 4,1')
    expect(describeMode('square', '(a,b)')).toBe('Mode (a,b)')
  })
})
