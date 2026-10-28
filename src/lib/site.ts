export const SITE_TITLE = 'Kyma Birds'
export const SITE_TAGLINE = 'Bird song, made visible.'
export const SITE_DESCRIPTION =
  'Listen to twelve birds and watch each song shape sand on a vibrating plate.'
export const SITE_H1 = 'Kyma Birds: bird song made visible'
export const SITE_HOME_TITLE = 'Kyma Birds: bird song, made visible'

/**
 * Production origin, baked in at build time (a VITE_ variable, not a wrangler var).
 * Unset means: no canonical or og:url, and root-relative og:image.
 */
export const SITE_ORIGIN: string | undefined = normalizeOrigin(import.meta.env?.VITE_SITE_ORIGIN)

export function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    return new URL(value.trim()).origin
  } catch {
    return undefined
  }
}

/** Absolute URL when the origin is known, otherwise the root-relative path. */
export function absoluteUrl(path: string, origin: string | undefined = SITE_ORIGIN): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return origin ? `${origin}${p}` : p
}
