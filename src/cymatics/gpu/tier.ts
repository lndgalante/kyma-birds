// Quality tiers (docs/specs/engine.md §8.1 step 4, §8.2). Three-free: the choice is pure, the
// environment read is a separate browser-only function.
import { TIERS } from '../params'
import type { QualityPreference, Tier } from '../types'

/** Best first. `floor` is reachable only through the governor. */
export const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low', 'floor']

export interface TierEnv {
  coarsePointer: boolean
  finePointer: boolean
  deviceMemory?: number
  hardwareConcurrency?: number
}

/** An explicit preference wins; `auto` reads the device. `caveat` = the renderer needed the caveat retry. */
export function pickTier(quality: QualityPreference, env: TierEnv, caveat = false): Tier {
  if (quality !== 'auto') return quality
  const mem = env.deviceMemory
  const cores = env.hardwareConcurrency
  const weak = (mem !== undefined && mem <= 4) || (cores !== undefined && cores <= 4)
  if (caveat || (env.coarsePointer && weak)) return 'low'
  if (env.finePointer && cores !== undefined && cores >= 8) return 'high'
  return 'medium'
}

/** One step down, or null below `floor`. */
export function lowerTier(t: Tier): Tier | null {
  return TIER_ORDER[TIER_ORDER.indexOf(t) + 1] ?? null
}

/** The lower-quality of two tiers. */
export function minTier(a: Tier, b: Tier): Tier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b
}

export function tierGrains(t: Tier): number {
  return TIERS[t].w * TIERS[t].h
}

/** Browser only: reads pointer media queries and navigator hints. */
export function readTierEnv(): TierEnv {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    coarsePointer: mq('(pointer: coarse)'),
    finePointer: mq('(pointer: fine)'),
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
  }
}
