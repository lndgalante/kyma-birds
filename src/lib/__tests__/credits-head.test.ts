import { describe, expect, it } from 'vitest'
import { shortAuthor, shortLicense, sourceLabel, xcNumber } from '~/lib/credits'
import { birdHead, creditsHead, jsonLd } from '~/lib/head'
import { getBirds } from '~/lib/manifest'
import { SITE_DESCRIPTION, SITE_ORIGIN, absoluteUrl, normalizeOrigin } from '~/lib/site'
import { birdPalette, hexToOklch, oklchToHex } from '~/lib/theme'

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
    expect(normalizeOrigin('javascript:alert(1)')).toBeUndefined()
    expect(normalizeOrigin('file:///tmp')).toBeUndefined()
    expect(absoluteUrl('/a', 'https://x.dev')).toBe('https://x.dev/a')
    expect(absoluteUrl('/a')).toBe(`${SITE_ORIGIN}/a`)
  })

  const birds = getBirds()
  const metaOf = (h: ReturnType<typeof birdHead>, key: string) =>
    h.meta.find((m) => m.property === key || m.name === key)?.content

  it('uses the public origin even without a build-time override', () => {
    const h = birdHead(birds, 'kakapo')
    expect(h.meta[0].title).toBe('Kākāpō bird song & cymatics · Kyma Birds')
    expect(metaOf(h, 'og:url')).toBe(`${SITE_ORIGIN}/?bird=kakapo`)
    expect(metaOf(h, 'og:image')).toBe(`${SITE_ORIGIN}/birds/kakapo/photo.webp`)
    expect(h.links).toContainEqual({ rel: 'canonical', href: `${SITE_ORIGIN}/?bird=kakapo` })
    expect(metaOf(h, 'theme-color')).toMatch(/^#[0-9a-f]{6}$/)
    expect(metaOf(h, 'description')!.length).toBeLessThanOrEqual(158)
  })

  it('with an origin: absolute canonical, og:url and og:image', () => {
    const h = birdHead(birds, 'kakapo', 'https://kyma.example')
    expect(metaOf(h, 'og:url')).toBe('https://kyma.example/?bird=kakapo')
    expect(metaOf(h, 'og:image')).toBe('https://kyma.example/birds/kakapo/photo.webp')
    expect(h.links).toContainEqual({ rel: 'canonical', href: 'https://kyma.example/?bird=kakapo' })
  })

  it('colours the browser bar with each bird’s room', () => {
    for (const b of birds) {
      const color = metaOf(birdHead(birds, b.slug, undefined), 'theme-color')
      expect(color).toBe(oklchToHex(birdPalette(b).ground))
      // The room is dark: at most 16% lightness (theme.ts).
      expect(hexToOklch(color!).l).toBeLessThanOrEqual(0.16)
    }
  })

  it('uses the home title and the default bird when no bird is asked for', () => {
    const h = birdHead(birds, undefined, 'https://kyma.example')
    expect(h.meta[0].title).toBe('Kyma Birds: bird song, made visible')
    expect(metaOf(h, 'og:title')).toBe(h.meta[0].title)
    expect(metaOf(h, 'description')).toBe(SITE_DESCRIPTION)
    expect(h.links).toContainEqual({ rel: 'canonical', href: 'https://kyma.example/' })
    expect(creditsHead(undefined).meta[0].title).toBe('Credits · Kyma Birds')
  })

  it('consolidates default and unknown bird URLs onto the home page', () => {
    for (const slug of [undefined, 'common-nightingale', 'unknown']) {
      const h = birdHead(birds, slug, 'https://kyma.example')
      expect(h.links).toEqual([{ rel: 'canonical', href: 'https://kyma.example/' }])
      expect(metaOf(h, 'og:url')).toBe('https://kyma.example/')
    }
    expect(creditsHead('https://kyma.example').links).toEqual([
      { rel: 'canonical', href: 'https://kyma.example/credits' },
    ])
  })

  it('keeps search, social previews and structured media aligned for every bird', () => {
    for (const b of birds) {
      const h = birdHead(birds, b.slug, 'https://kyma.example')
      expect(metaOf(h, 'og:title')).toBe(h.meta[0].title)
      expect(metaOf(h, 'twitter:title')).toBe(h.meta[0].title)
      expect(metaOf(h, 'twitter:image')).toBe(metaOf(h, 'og:image'))
      const { '@graph': graph } = JSON.parse(h.scripts[0].children)
      const page = graph.find((node: { '@type': string }) => node['@type'] === 'WebPage')
      expect(page.url).toBe(h.links[0].href)
      expect(page.about.alternateName).toBe(b.scientificName)
      expect(page.mainEntity.contentUrl).toBe(`https://kyma.example${b.audio.src}`)
      expect(page.mainEntity.license).toBe(b.credits.audio.licenseUrl)
      expect(page.primaryImageOfPage.license).toBe(b.credits.photo.licenseUrl)
    }
  })

  it('escapes script-closing content without corrupting structured data', () => {
    const data = { description: '</script><script>alert(1)</script>' }
    const { children } = jsonLd(data)
    expect(children).not.toContain('<')
    expect(JSON.parse(children)).toEqual(data)
  })
})
