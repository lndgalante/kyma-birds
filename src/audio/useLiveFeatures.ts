import { useEffect, useRef } from 'react'
import type { LiveFeatures } from './AudioProvider'
import { useAudioApi } from './useAudio'

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
