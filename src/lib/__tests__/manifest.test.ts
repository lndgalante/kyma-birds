import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BIRD_SLUG,
  SLUGS,
  committedIndexOf,
  getBirds,
  kebab,
  labelSideOf,
  localNameEntries,
  photoSizes,
  photoSrcSet,
  prepareBirds,
} from '~/lib/manifest'
import { validateBirdSearch } from '~/lib/search'

describe('manifest', () => {
  const birds = getBirds()

  it('has twelve birds sorted by voice pitch', () => {
    expect(birds).toHaveLength(12)
    for (let i = 1; i < birds.length; i++) {
      expect(birds[i].audio.bandHz.p50).toBeGreaterThanOrEqual(birds[i - 1].audio.bandHz.p50)
    }
    expect(Object.isFrozen(birds)).toBe(true)
    expect(SLUGS.size).toBe(12)
  })

  it('derives a slug when one is missing', () => {
    expect(kebab('White-browed Robin-Chat')).toBe('white-browed-robin-chat')
    expect(kebab('Kākāpō')).toBe('kakapo')
    const [b] = prepareBirds([{ ...birds[0], slug: '' }])
    expect(b.slug).toBe(kebab(birds[0].commonName))
  })

  it('falls back to the default bird, the Nightingale', () => {
    const nightingale = birds.findIndex((b) => b.slug === DEFAULT_BIRD_SLUG)
    expect(birds[nightingale]?.commonName).toBe('Common Nightingale')
    expect(committedIndexOf(birds, undefined)).toBe(nightingale)
    expect(committedIndexOf(birds, 'nope')).toBe(nightingale)
    expect(committedIndexOf(birds, birds[0].slug)).toBe(0)
  })

  it('uses the real photo widths in srcset, portraits included', () => {
    const tui = birds.find((b) => b.slug === 'tui')!
    expect(photoSrcSet(tui)).toBe('/birds/tui/photo-sm.webp 600w, /birds/tui/photo.webp 1200w')
    for (const b of birds) {
      expect(photoSrcSet(b)).toContain(`${b.photo.width}w`)
    }
  })

  it('sizes portraits by the card width and landscapes by the photo height', () => {
    const tui = birds.find((b) => b.slug === 'tui')!
    expect(photoSizes(tui)).toMatch(/\(min-width: 100rem\) 734px, .+\) 600px, 100vw$/)
    const kakapo = birds.find((b) => b.slug === 'kakapo')!
    const sizes = photoSizes(kakapo)
    expect(sizes).toContain('(min-height: 51rem) calc(1.778 * (100vh - 351px))')
    expect(sizes).toContain('calc(1.778 * (100vh - 216px))')
    expect(sizes).toContain('(max-width: 39.99rem) calc(1.778 * 50vh)')
    expect(sizes.endsWith(', 100vw')).toBe(true)
    for (const b of birds) expect(photoSizes(b)).not.toMatch(/NaN|Infinity/)
  })

  it('picks Latin-script local names, Portuguese and Spanish first, without the common name', () => {
    const tui = birds.find((b) => b.slug === 'tui')!
    expect(localNameEntries(tui).map((n) => n.tag)).toEqual(['PT', 'ES'])
    expect(localNameEntries(tui)[0].lang).toBe('pt-BR')
    const shama = birds.find((b) => b.slug === 'white-rumped-shama')!
    expect(localNameEntries(shama).some((n) => n.tag === 'HI')).toBe(false)
  })

  it('places the label opposite the bird unless the manifest says otherwise', () => {
    const b = birds[0]
    expect(
      labelSideOf({ ...b, photo: { ...b.photo, labelSide: undefined, focal: { x: 0.3, y: 0.5 } } }),
    ).toBe('end')
    expect(
      labelSideOf({ ...b, photo: { ...b.photo, labelSide: undefined, focal: { x: 0.7, y: 0.5 } } }),
    ).toBe('start')
    expect(labelSideOf({ ...b, photo: { ...b.photo, labelSide: 'start' } })).toBe('start')
  })
})

describe('search', () => {
  it('keeps known slugs, drops everything else', () => {
    expect(validateBirdSearch({ bird: 'kakapo', plate: 'square' })).toEqual({ bird: 'kakapo' })
    expect(validateBirdSearch({ bird: 'dodo' })).toEqual({})
    expect(validateBirdSearch({ bird: 3 })).toEqual({})
  })

  // The router spreads the raw URL search under the validated one, so dropped values must be
  // explicit undefined keys or they leak through.
  it('overrides invalid raw values with explicit undefined keys', () => {
    expect(validateBirdSearch({})).toStrictEqual({ bird: undefined })
    const raw = { bird: 'nope' }
    expect({ ...raw, ...validateBirdSearch(raw) }).toStrictEqual({ bird: undefined })
  })
})
