import { describe, expect, it } from 'vitest'
import { shortAuthor, shortLicense, sourceLabel, xcNumber } from '~/lib/credits'
import { birdHead, creditsHead } from '~/lib/head'
import { getBirds } from '~/lib/manifest'
import { absoluteUrl, normalizeOrigin } from '~/lib/site'

describe('credits helpers', () => {
  it('labels sources by host', () => {
    expect(sourceLabel('https://commons.wikimedia.org/wiki/File:Tui.jpg')).toBe('Wikimedia Commons')
    expect(sourceLabel('https://xeno-canto.org/123456')).toBe('xeno-canto XC123456')
    expect(sourceLabel('https://www.example.org/x')).toBe('example.org')
    expect(sourceLabel('not a url')).toBe('Source')
    expect(xcNumber('https://xeno-canto.org/123456/download')).toBe('XC123456')
    expect(xcNumber('https://commons.wikimedia.org/wiki/File:X_XC1234.mp3')).toBeNull()
  })

  it('shortens licences and institutional authors', () => {
    expect(shortLicense('CC BY-SA 4.0')).toBe('CC BY-SA')
    expect(shortLicense('CC0 1.0')).toBe('CC0')
    expect(shortAuthor('Department of Conservation (NZ), © Crown Copyright')).toBe(
      'Department of Conservation (NZ)',
    )
    expect(shortAuthor('Niels Krabbe')).toBe('Niels Krabbe')
  })

  it('gives every bird complete TASL data', () => {
    for (const b of getBirds()) {
      for (const c of [b.credits.photo, b.credits.audio]) {
        expect(c.author).toBeTruthy()
        expect(c.license).toMatch(/^CC/)
        expect(c.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//)
        expect(c.source).toMatch(/^https:\/\//)
        expect(c.changes).toBeTruthy()
      }
    }
  })
})

describe('site and head', () => {
  it('only trusts a parseable origin', () => {
    expect(normalizeOrigin('https://kyma.example/')).toBe('https://kyma.example')
    expect(normalizeOrigin('')).toBeUndefined()
    expect(normalizeOrigin(undefined)).toBeUndefined()
    expect(normalizeOrigin('nope')).toBeUndefined()
    expect(absoluteUrl('/a', 'https://x.dev')).toBe('https://x.dev/a')
    expect(absoluteUrl('/a', undefined)).toBe('/a')
  })

  const birds = getBirds()
  const metaOf = (h: ReturnType<typeof birdHead>, key: string) =>
    h.meta.find((m) => m.property === key || m.name === key)?.content

  it('without an origin: no canonical or og:url, root-relative og:image (decision 3)', () => {
    const h = birdHead(birds, 'kakapo', undefined)
    expect(h.meta[0].title).toBe('Kākāpō · Kyma Birds')
    expect(metaOf(h, 'og:url')).toBeUndefined()
    expect(metaOf(h, 'og:image')).toBe('/birds/kakapo/photo.webp')
    expect(h.links.some((l) => l.rel === 'canonical')).toBe(false)
    expect(metaOf(h, 'theme-color')).toMatch(/^#[0-9a-f]{6}$/)
    expect(metaOf(h, 'description')!.length).toBeLessThanOrEqual(158)
  })

  it('with an origin: absolute canonical, og:url and og:image', () => {
    const h = birdHead(birds, 'kakapo', 'https://kyma.example')
    expect(metaOf(h, 'og:url')).toBe('https://kyma.example/?bird=kakapo')
    expect(metaOf(h, 'og:image')).toBe('https://kyma.example/birds/kakapo/photo.webp')
    expect(h.links).toContainEqual({ rel: 'canonical', href: 'https://kyma.example/?bird=kakapo' })
  })

  it('uses the home title and the default bird when no bird is asked for', () => {
    const h = birdHead(birds, undefined, 'https://kyma.example')
    expect(h.meta[0].title).toBe('Kyma Birds: bird song, made visible')
    expect(metaOf(h, 'og:title')).toBe('Common Nightingale · Kyma Birds')
    expect(h.links).toContainEqual({ rel: 'canonical', href: 'https://kyma.example/' })
    expect(creditsHead(undefined).meta[0].title).toBe('Credits · Kyma Birds')
  })
})
