import raw from '~/data/birds.json'

export type IucnCode = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE'
export type LabelSide = 'start' | 'end'

export interface BandHz {
  p10: number
  p50: number
  p90: number
}

export interface Credit {
  title: string
  author: string
  license: string
  licenseUrl: string
  source: string
  changes: string
  catalog?: string
}

export interface Bird {
  slug: string
  commonName: string
  scientificName: string
  localNames: Record<string, string>
  family: string
  iucnStatus: { code: IucnCode; label: string }
  region: string
  habitat: string
  traits: string[]
  songDescription: string
  songCharacter: string
  photo: {
    src: string
    srcSm: string
    width: number
    height: number
    focal: { x: number; y: number }
    lqip: string
    dominantColor: string
    accentColor: string
    alt?: string
    labelSide?: LabelSide
    scrim?: number
    birdBox?: { x0: number; x1: number; y0: number; y1: number }
  }
  audio: {
    src: string
    durationSec: number
    sampleRate: number
    fileSampleRate: number
    validFrames: number
    primingFrames: number
    bandHz: BandHz
    peakHz: number
    fingerprint?: string
  }
  credits: { photo: Credit; audio: Credit }
}

/** Committed bird when `?bird` is absent or unknown: the best-known songbird of the twelve. */
export const DEFAULT_BIRD_SLUG = 'common-nightingale'

export function kebab(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type RawBird = Omit<Bird, 'slug'> & { slug?: string }

/** Fills missing slugs and sorts by voice pitch (p50 ascending), so the picker reads Low → High. */
export function prepareBirds(input: readonly RawBird[]): readonly Bird[] {
  const birds = input.map((b) => ({ ...b, slug: b.slug || kebab(b.commonName) }) as Bird)
  birds.sort((a, b) => a.audio.bandHz.p50 - b.audio.bandHz.p50)
  return Object.freeze(birds)
}

let cached: readonly Bird[] | null = null

export function getBirds(): readonly Bird[] {
  return (cached ??= prepareBirds(raw as unknown as RawBird[]))
}

export const SLUGS: ReadonlySet<string> = new Set(getBirds().map((b) => b.slug))

/** Index of `slug`, falling back to the default bird, then to 0. */
export function committedIndexOf(birds: readonly Bird[], slug: string | undefined): number {
  const i = slug ? birds.findIndex((b) => b.slug === slug) : -1
  if (i >= 0) return i
  return Math.max(
    0,
    birds.findIndex((b) => b.slug === DEFAULT_BIRD_SLUG),
  )
}

/** Local names worth showing: Portuguese and Spanish first, then the rest, minus the common name. */
export function localNameEntries(b: Bird): Array<{ lang: string; tag: string; name: string }> {
  const order = ['pt', 'es', 'mi', 'fr', 'de']
  const keys = Object.keys(b.localNames).sort(
    (x, y) => rank(order, x) - rank(order, y) || x.localeCompare(y),
  )
  const seen = new Set([b.commonName.toLowerCase()])
  const out: Array<{ lang: string; tag: string; name: string }> = []
  for (const k of keys) {
    const name = b.localNames[k]
    // Latin script only: the self-hosted fonts carry Latin subsets, and a system fallback
    // in the middle of the field label reads as a glitch.
    if (!name || !LATIN.test(name) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ lang: k === 'pt' ? 'pt-BR' : k, tag: k.toUpperCase(), name })
  }
  return out
}

const LATIN = /^[\p{Script=Latin}\p{Zs}'’.-]+$/u

function rank(order: string[], k: string) {
  const i = order.indexOf(k)
  return i < 0 ? order.length : i
}

export function labelSideOf(b: Bird): LabelSide {
  return b.photo.labelSide ?? (b.photo.focal.x <= 0.5 ? 'end' : 'start')
}

export function photoAlt(b: Bird): string {
  return b.photo.alt ?? `${b.commonName}. ${b.traits.slice(0, 2).join(' ')}`
}

export function photoSrcSet(b: Bird): string {
  return `${b.photo.srcSm} ${Math.round(b.photo.width / 2)}w, ${b.photo.src} ${b.photo.width}w`
}

// The `split` variant's media condition (app.css), in the syntax `sizes` accepts everywhere.
const SPLIT_MEDIA = '(min-width: 64rem) and (min-aspect-ratio: 5/4) and (min-height: 34.0625rem)'

/**
 * `sizes` for a bird photo. It is cropped to its box (object-fit: cover), so it renders at
 * max(box width, box height x aspect ratio), and that depends on the photo's shape:
 * - Portrait: width-driven; the Split card column is about 540-680px wide (734px on the widest
 *   screens). 600px lets a 1x laptop take the 600w file instead of three times the bytes.
 * - Landscape: height-driven in Split, where the track is 100vh - 216px tall (masthead,
 *   padding, zone head and foot) and the photo about 135px less once the card is captioned
 *   (a track of 600px or more); and in Field, where the photo is about half the screen tall.
 *   Stacked and Compact landscape cards are wide enough that the width drives.
 */
export function photoSizes(b: Bird): string {
  const ar = Math.round((b.photo.width / b.photo.height) * 1000) / 1000
  if (ar < 1) return `${SPLIT_MEDIA} and (min-width: 100rem) 734px, ${SPLIT_MEDIA} 600px, 100vw`
  return [
    `${SPLIT_MEDIA} and (min-height: 51rem) calc(${ar} * (100vh - 351px))`,
    `${SPLIT_MEDIA} calc(${ar} * (100vh - 216px))`,
    `(max-width: 39.99rem) calc(${ar} * 50vh)`,
    '100vw',
  ].join(', ')
}
