import { committedIndexOf, photoAlt, type Bird } from './manifest'
import { SITE_DESCRIPTION, SITE_HOME_TITLE, SITE_ORIGIN, SITE_TITLE, absoluteUrl } from './site'
import { themeColorHex } from './theme'
import { truncate } from './format'

type Meta = Record<string, string>
type Link = Record<string, string>

/** Per-bird `<head>` for `/` (ui.md §9.6); absolute URLs only when SITE_ORIGIN is set. */
export function birdHead(
  birds: readonly Bird[],
  slug: string | undefined,
  origin: string | undefined = SITE_ORIGIN,
): { meta: Meta[]; links: Link[] } {
  const b = birds[committedIndexOf(birds, slug)]
  const path = slug ? `/?bird=${b.slug}` : '/'
  const description = truncate(`${b.commonName} (${b.scientificName}). ${b.songDescription}`, 158)
  const title = slug ? `${b.commonName} · ${SITE_TITLE}` : SITE_HOME_TITLE

  const meta: Meta[] = [
    { title },
    { name: 'description', content: description },
    // The bird's room, so the browser's own bar continues it.
    { name: 'theme-color', content: themeColorHex(b) },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_TITLE },
    { property: 'og:title', content: `${b.commonName} · ${SITE_TITLE}` },
    { property: 'og:description', content: description },
  ]
  if (origin) meta.push({ property: 'og:url', content: absoluteUrl(path, origin) })
  meta.push(
    { property: 'og:image', content: absoluteUrl(b.photo.src, origin) },
    { property: 'og:image:width', content: String(b.photo.width) },
    { property: 'og:image:height', content: String(b.photo.height) },
    { property: 'og:image:alt', content: photoAlt(b) },
    { name: 'twitter:card', content: 'summary_large_image' },
  )

  // No image preload here: React 19 already hoists one for the committed <img fetchPriority="high">.
  const links: Link[] = origin ? [{ rel: 'canonical', href: absoluteUrl(path, origin) }] : []
  return { meta, links }
}

export function creditsHead(origin: string | undefined = SITE_ORIGIN): {
  meta: Meta[]
  links: Link[]
} {
  const meta: Meta[] = [
    { title: `Credits · ${SITE_TITLE}` },
    {
      name: 'description',
      content: `Photo and sound credits for ${SITE_TITLE}. ${SITE_DESCRIPTION}`,
    },
    { name: 'robots', content: 'index' },
  ]
  const links: Link[] = origin ? [{ rel: 'canonical', href: absoluteUrl('/credits', origin) }] : []
  return { meta, links }
}
