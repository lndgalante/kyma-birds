import { useEffect, useRef, useState } from 'react'
import type { LiveFeatures } from './AudioProvider'
import { useAudioApi, useAudioField } from './useAudio'

/**
 * Runs `draw` on every animation frame while `active`, handing it the latest features.
 * Nothing here touches React state: rAF consumers draw straight to the DOM or a canvas.
 */
export function useFeatureFrames(
  draw: (f: LiveFeatures, now: number) => void,
  active: boolean,
  fps = 60,
): void {
  const api = useAudioApi()
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = 0
    const minDt = 1000 / fps - 2
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < minDt) return
      last = now
      drawRef.current(api.features(), now)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [api, active, fps])
}

export interface FeatureSnapshot {
  dominantHz: number | null
  /** True once any voiced frame has been seen since the page loaded. */
  heard: boolean
  /** The last voiced value is being held through a silence longer than `holdMs`. */
  stale: boolean
}

const EMPTY: FeatureSnapshot = { dominantHz: null, heard: false, stale: false }

/**
 * An 8 Hz snapshot of the live readout values (ui.md §5.3): React re-renders only when a
 * displayed value changes. Silence longer than `holdMs` keeps the last value, marked stale.
 */
export function useThrottledFeatures(hz = 8, holdMs = 400): FeatureSnapshot {
  const api = useAudioApi()
  const status = useAudioField('state')
  const [snap, setSnap] = useState<FeatureSnapshot>(EMPTY)
  const lastVoicedAt = useRef(0)
  const held = useRef<number | null>(null)

  useEffect(() => {
    const sample = () => {
      const f = api.features()
      const now = performance.now()
      if (f.dominantHz != null && status === 'playing') {
        held.current = f.dominantHz
        lastVoicedAt.current = now
      }
      const value = held.current
      const stale = value == null || status !== 'playing' || now - lastVoicedAt.current > holdMs
      const next: FeatureSnapshot = {
        dominantHz: value == null ? null : Math.round(value / 10) * 10,
        heard: value != null,
        stale,
      }
      setSnap((prev) =>
        prev.dominantHz === next.dominantHz &&
        prev.heard === next.heard &&
        prev.stale === next.stale
          ? prev
          : next,
      )
    }
    sample()
    if (status !== 'playing') return
    const id = window.setInterval(sample, 1000 / hz)
    return () => window.clearInterval(id)
  }, [api, status, hz, holdMs])

  return snap
}
