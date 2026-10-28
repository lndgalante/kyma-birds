import { useRef } from 'react'
import { useAudioField, useModeKey } from '~/audio/useAudio'
import { COPY, plateCaptionHeld, plateCaptionLive } from '~/lib/copy'
import { formatMode } from '~/lib/format'

export interface PlateCaption {
  kind: 'idle' | 'live' | 'held' | 'error'
  /** "(3, 2)" or "" */
  mode: string
  /** The mode key the sand shows: the live one, or the one frozen by Hold. */
  modeKey: string | null
  text: string
}

/** The plate's one-line status (ui.md §10.4), shared by the figcaption and the foot row. */
export function usePlateCaption(held: boolean): PlateCaption {
  const state = useAudioField('state')
  const liveKey = useModeKey()
  // Telemetry keeps flowing while the sand is held, so "Held · mode" names the pattern that was
  // frozen, not whatever the song is driving now. Undefined means nothing is frozen.
  const frozen = useRef<string | null | undefined>(undefined)
  if (!held) frozen.current = undefined
  else if (frozen.current === undefined) frozen.current = liveKey
  const modeKey = frozen.current === undefined ? liveKey : frozen.current
  const mode = formatMode(modeKey)
  if (state === 'error') return { kind: 'error', mode, modeKey, text: COPY.plateCaptionError }
  if (held) return { kind: 'held', mode, modeKey, text: plateCaptionHeld(mode) }
  if (state === 'idle' || !mode) {
    // "Waiting for sound" belongs to the idle plate; a paused one (say, after Scatter, which
    // clears the mode) just rests.
    const text = state === 'paused' ? COPY.statePaused : COPY.plateCaptionIdle
    return { kind: 'idle', mode, modeKey, text }
  }
  return { kind: 'live', mode, modeKey, text: plateCaptionLive(mode) }
}
