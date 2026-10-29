import { describe, expect, it } from 'vitest'
import {
  formatBand,
  formatBandSpoken,
  formatDuration,
  formatHz,
  formatHzShort,
  formatMode,
  platePhotoName,
  truncate,
} from '~/lib/format'

const NB = ' '

describe('format', () => {
  it('formats frequencies with a no-break space before the unit', () => {
    expect(formatHz(1840)).toBe(`1.84${NB}kHz`)
    expect(formatHz(860)).toBe(`860${NB}Hz`)
    expect(formatHz(0)).toBe('—')
    expect(formatHz(Number.NaN)).toBe('—')
    expect(formatHzShort(2131)).toBe(`2.1${NB}kHz`)
    expect(formatHzShort(2000)).toBe(`2${NB}kHz`)
    expect(formatHzShort(305)).toBe(`305${NB}Hz`)
  })

  it('formats bands with an en dash, in one unit when it can', () => {
    expect(formatBand({ p10: 2100, p90: 4600 })).toBe(`2.1–4.6${NB}kHz`)
    expect(formatBand({ p10: 576, p90: 698 })).toBe(`576–698${NB}Hz`)
    expect(formatBand({ p10: 944, p90: 2576 })).toBe(`944${NB}Hz–2.6${NB}kHz`)
    expect(formatBandSpoken({ p10: 2100, p90: 4600 })).toBe('2.1 to 4.6 kHz')
  })

  it('normalises mode keys', () => {
    expect(formatMode('(3,2)')).toBe('(3, 2)')
    expect(formatMode('(4, 1)')).toBe('(4, 1)')
    expect(formatMode(null)).toBe('')
    expect(formatMode('weird')).toBe('weird')
  })

  it('formats durations and truncation', () => {
    expect(formatDuration(24)).toBe('0:24')
    expect(formatDuration(27.22)).toBe('0:27')
    expect(formatDuration(65)).toBe('1:05')
    expect(truncate('short', 10)).toBe('short')
    const t = truncate('Ringing, bell-like tolls and liquid notes mixed with clicks', 30)
    expect(t.length).toBeLessThanOrEqual(30)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/[,\s]…$/)
  })

  it('names a plate photo after the bird and the local time', () => {
    expect(platePhotoName('tui', new Date(2026, 9, 29, 1, 42, 3))).toBe(
      'kyma-birds-tui-20261029-014203.png',
    )
  })
})
