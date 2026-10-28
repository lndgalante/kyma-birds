import { AUDIO } from './params'
import type { BirdSongAsset } from './types'

export interface LoopRegion {
  start: number
  end: number
  mode: 'manifest' | 'trimmed' | 'whole'
}

const PRIMING_SEC = AUDIO.aacPrimingFrames / AUDIO.aacPrimingRate

/** Where the seamless loop sits inside a decoded buffer (all times in buffer seconds). */
export function resolveLoopRegion(
  song: Pick<BirdSongAsset, 'durationSec' | 'loop'>,
  bufferDuration: number,
): LoopRegion {
  const L = song.durationSec
  if (song.loop) {
    const { startSec: s, endSec: e } = song.loop
    if (s >= 0 && e > s && Math.abs(e - s - L) < 0.01 && s < bufferDuration) {
      return { start: s, end: Math.min(e, bufferDuration), mode: 'manifest' }
    }
  }
  const excess = bufferDuration - L
  if (L > 0 && excess > 0 && excess <= 0.1) {
    // Unpadded AAC whose decoder kept the encoder delay and/or the final-frame padding.
    // A decoder either keeps all 2112 priming frames or none, so an excess shorter than the
    // priming means only tail padding is left and the loop starts at 0.
    const lead = excess >= PRIMING_SEC - 1e-3 ? PRIMING_SEC : 0
    return { start: lead, end: lead + L, mode: 'trimmed' }
  }
  return { start: 0, end: bufferDuration, mode: 'whole' }
}
