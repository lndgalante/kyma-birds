import { describe, expect, it } from 'vitest'
import { lowerTier, minTier, pickTier, TIER_ORDER, tierGrains, type TierEnv } from '../gpu/tier'
import { TIERS } from '../params'

const desktop: TierEnv = { coarsePointer: false, finePointer: true, hardwareConcurrency: 10 }
const laptop4: TierEnv = { coarsePointer: false, finePointer: true, hardwareConcurrency: 4 }
const phoneLow: TierEnv = {
  coarsePointer: true,
  finePointer: false,
  deviceMemory: 3,
  hardwareConcurrency: 8,
}
const phoneMid: TierEnv = {
  coarsePointer: true,
  finePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
}

describe('pickTier', () => {
  it('honours an explicit preference over the device', () => {
    expect(pickTier('low', desktop)).toBe('low')
    expect(pickTier('high', phoneLow)).toBe('high')
    expect(pickTier('medium', desktop, true)).toBe('medium')
  })

  it('auto: fine pointer with ≥ 8 cores is high, otherwise medium', () => {
    expect(pickTier('auto', desktop)).toBe('high')
    expect(pickTier('auto', laptop4)).toBe('medium')
    expect(pickTier('auto', { coarsePointer: false, finePointer: true })).toBe('medium')
  })

  it('auto: a coarse pointer on a weak device is low; a strong phone is medium', () => {
    expect(pickTier('auto', phoneLow)).toBe('low')
    expect(pickTier('auto', { ...phoneMid, hardwareConcurrency: 4 })).toBe('low')
    expect(pickTier('auto', phoneMid)).toBe('medium')
  })

  it('auto: the caveat retry (software rasteriser) forces low', () => {
    expect(pickTier('auto', desktop, true)).toBe('low')
  })
})

describe('tier helpers', () => {
  it('steps down one tier at a time and stops below floor', () => {
    expect(TIER_ORDER.map(lowerTier)).toEqual(['medium', 'low', 'floor', null])
  })

  it('minTier picks the lower quality', () => {
    expect(minTier('high', 'low')).toBe('low')
    expect(minTier('floor', 'medium')).toBe('floor')
    expect(minTier('medium', 'medium')).toBe('medium')
  })

  it('grain counts follow the sim texture sizes (spec §8.2)', () => {
    expect(TIER_ORDER.map(tierGrains)).toEqual([262144, 131072, 65536, 32768])
    for (const t of TIER_ORDER) expect(tierGrains(t)).toBe(TIERS[t].w * TIERS[t].h)
  })
})
