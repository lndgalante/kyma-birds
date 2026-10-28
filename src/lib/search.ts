import { SLUGS } from './manifest'

/** The URL state of `/` and `/credits`: the selected bird. */
export type BirdSearch = { bird?: string }

/** How a bird change was started; announcements are skipped for the rail (its tab already speaks). */
export type NavSource = 'scroll' | 'button' | 'rail' | 'key' | 'wheel' | 'media' | 'url'

// Unknown slugs map to undefined so the URL stays minimal. The key must be present: the router
// spreads the raw URL search under each route's validated search, so an omitted key would let
// the raw value (`?bird=nope`) through to the app.
export function validateBirdSearch(raw: Record<string, unknown>): BirdSearch {
  const bird = raw.bird
  return { bird: typeof bird === 'string' && SLUGS.has(bird) ? bird : undefined }
}
