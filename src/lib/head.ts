import { DEFAULT_BIRD_SLUG, birdPath, committedIndexOf, photoAlt, type Bird } from './manifest'
import { SITE_DESCRIPTION, SITE_HOME_TITLE, SITE_ORIGIN, SITE_TITLE, absoluteUrl } from './site'
import { themeColorHex } from './theme'
import { truncate } from './format'

type Meta = Record<string, string>
type Link = Record<string, string>

/** Search and sharing metadata for the selected bird. */
export function birdHead(birds: readonly Bird[], slug: string | undefined, origin = SITE_ORIGIN) {
  const b = birds[committedIndexOf(birds, slug)]
  const home = b.slug === DEFAULT_BIRD_SLUG
  const url = absoluteUrl(birdPath(b.slug), origin)
  const description = home
    ? SITE_DESCRIPTION
    : truncate(
        `Listen to the ${b.commonName} (${b.scientificName}) and watch its song form cymatic sand patterns. ${b.songDescription}`,
        158,
      )
  const title = home ? SITE_HOME_TITLE : `${b.commonName} bird song & cymatics · ${SITE_TITLE}`

  const meta: Meta[] = [
    { title },
    { name: 'description', content: description },
    // The bird's room, so the browser's own bar continues it.
    { name: 'theme-color', content: themeColorHex(b) },
    ...socialMeta(title, description, url, 'summary_large_image'),
  ]
  meta.push(
    { property: 'og:image', content: absoluteUrl(b.photo.src, origin) },
    { property: 'og:image:width', content: String(b.photo.width) },
    { property: 'og:image:height', content: String(b.photo.height) },
    { property: 'og:image:alt', content: photoAlt(b) },
    { name: 'twitter:image', content: absoluteUrl(b.photo.src, origin) },
    { name: 'twitter:image:alt', content: photoAlt(b) },
  )

  // No image preload here: React 19 already hoists one for the committed <img fetchPriority="high">.
  const links: Link[] = [{ rel: 'canonical', href: url }]
  return {
    meta,
    links,
    scripts: [
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${absoluteUrl('/', origin)}#website`,
            url: absoluteUrl('/', origin),
            name: SITE_TITLE,
            description: SITE_DESCRIPTION,
            inLanguage: 'en',
          },
          {
            '@type': 'WebPage',
            '@id': `${url}#webpage`,
            url,
            name: title,
            description,
            inLanguage: 'en',
            isPartOf: { '@id': `${absoluteUrl('/', origin)}#website` },
            about: { '@type': 'Thing', name: b.commonName, alternateName: b.scientificName },
            primaryImageOfPage: {
              '@type': 'ImageObject',
              contentUrl: absoluteUrl(b.photo.src, origin),
              width: b.photo.width,
              height: b.photo.height,
              caption: photoAlt(b),
              creator: { '@type': 'Person', name: b.credits.photo.author },
              license: b.credits.photo.licenseUrl,
              creditText: `${b.credits.photo.author}, ${b.credits.photo.license}`,
            },
            mainEntity: {
              '@type': 'AudioObject',
              name: `${b.commonName} bird song`,
              description: b.songDescription,
              contentUrl: absoluteUrl(b.audio.src, origin),
              encodingFormat: 'audio/mp4',
              duration: `PT${b.audio.durationSec}S`,
              creator: { '@type': 'Person', name: b.credits.audio.author },
              license: b.credits.audio.licenseUrl,
              creditText: `${b.credits.audio.author}, ${b.credits.audio.license}`,
            },
          },
        ],
      }),
    ],
  }
}

export function creditsHead(origin = SITE_ORIGIN): {
  meta: Meta[]
  links: Link[]
} {
  const title = `Credits · ${SITE_TITLE}`
  const description =
    'Meet the photographers and field recordists behind Kyma Birds. Sources, Creative Commons licenses and adaptations for all twelve bird photos and songs.'
  const url = absoluteUrl('/credits', origin)
  const meta: Meta[] = [
    { title },
    { name: 'description', content: description },
    ...socialMeta(title, description, url),
  ]
  const links: Link[] = [{ rel: 'canonical', href: url }]
  return { meta, links }
}

function socialMeta(title: string, description: string, url: string, card = 'summary'): Meta[] {
  return [
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_TITLE },
    { property: 'og:locale', content: 'en_US' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { name: 'twitter:card', content: card },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ]
}

export function jsonLd(data: unknown) {
  return { type: 'application/ld+json', children: JSON.stringify(data).replace(/</g, '\\u003c') }
}
