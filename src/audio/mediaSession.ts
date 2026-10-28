import { useEffect, useRef } from 'react'
import type { EngineState } from '~/audio/engine'
import type { Bird } from '~/lib/manifest'
import { SITE_TITLE } from '~/lib/site'

interface MediaSessionOptions {
  bird: Bird
  state: EngineState
  onPlay(): void
  onPause(): void
  onPrev(): void
  onNext(): void
}

/** OS media controls (progressive enhancement, ui.md §5.1). No hidden <audio> hack. */
export function useMediaSession({ bird, state, ...handlers }: MediaSessionOptions): void {
  const ref = useRef(handlers)
  ref.current = handlers
  const active = state === 'playing' || state === 'paused' || state === 'loading'

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        // Unsupported action on this platform.
      }
    }
    set('play', () => ref.current.onPlay())
    set('pause', () => ref.current.onPause())
    set('previoustrack', () => ref.current.onPrev())
    set('nexttrack', () => ref.current.onNext())
    return () => {
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) set(a, null)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!active || typeof MediaMetadata === 'undefined') return
    const w = Math.round(bird.photo.width / 2)
    const h = Math.round(bird.photo.height / 2)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bird.commonName,
      artist: bird.scientificName,
      album: SITE_TITLE,
      artwork: [{ src: bird.photo.srcSm, sizes: `${w}x${h}`, type: 'image/webp' }],
    })
  }, [bird, active])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState =
      state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'none'
  }, [state])
}
