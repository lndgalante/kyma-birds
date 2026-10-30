export const SITE_TITLE = 'Kyma Birds'
export const SITE_TAGLINE = 'Bird song, made visible.'
export const SITE_DESCRIPTION =
  'Listen to twelve bird songs and explore cymatics: watch each voice shape sand into patterns on a simulated Chladni plate. A free interactive sound experience.'
export const SITE_H1 = 'Kyma Birds: bird song made visible'
export const SITE_HOME_TITLE = 'Kyma Birds: bird song, made visible'

/** Override the public origin at build time for another deployment. */
export const SITE_ORIGIN =
  normalizeOrigin(import.meta.env?.VITE_SITE_ORIGIN) ?? 'https://kymabirds.com'

export function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.origin : undefined
  } catch {
    return undefined
  }
}

export function absoluteUrl(path: string, origin = SITE_ORIGIN): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${origin}${p}`
}
