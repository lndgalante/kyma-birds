// The plate as a React component (docs/specs/engine.md §9.1): the lazy chunk, and the only React file that
// imports three. It fills its absolutely positioned host; React never re-renders it per frame.
import '@tanstack/react-start/client-only'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { PlateController } from './gpu/PlateController'
import type { CymaticsPlateProps } from './types'

const MAX_RESTORES = 3

export default function CymaticsPlate(props: CymaticsPlateProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctrlRef = useRef<PlateController | null>(null)
  const latest = useRef(props)
  latest.current = props
  // Bumping `gen` remounts the controller with a fresh canvas (after a context restore).
  const [gen, setGen] = useState(0)
  const restores = useRef(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const p = latest.current
    let alive = true
    const result = PlateController.create(host, {
      quality: p.quality ?? 'auto',
      source: p.source,
      bird: p.bird,
      shape: p.plateShape,
      paused: p.paused,
      held: !!p.held,
      reducedMotion: p.reducedMotion,
      accentColor: p.accentColor,
      debug: !!p.debug,
      onReady: (info) => latest.current.onReady?.(info),
      onError: (e) => latest.current.onError?.(e),
      onTelemetry: (t) => latest.current.onTelemetry?.(t),
      onRestored: () => {
        if (!alive) return
        if (++restores.current <= MAX_RESTORES) setGen((g) => g + 1)
        else
          latest.current.onError?.({
            code: 'context-lost',
            recoverable: false,
            message: 'The WebGL context was lost repeatedly',
          })
      },
    })
    if (!(result instanceof PlateController)) {
      p.onError?.(result)
      return
    }
    ctrlRef.current = result
    return () => {
      alive = false
      result.dispose()
      if (ctrlRef.current === result) ctrlRef.current = null
    }
  }, [props.quality, gen])

  useEffect(() => ctrlRef.current?.setSource(props.source), [props.source, gen])
  useEffect(() => ctrlRef.current?.setShape(props.plateShape), [props.plateShape, gen])
  // Calibration only changes with the bird, not with a new object for the same bird.
  useEffect(() => ctrlRef.current?.setBird(props.bird), [props.bird?.id, gen])
  useEffect(() => ctrlRef.current?.setPaused(props.paused), [props.paused, gen])
  useEffect(() => ctrlRef.current?.setHeld(!!props.held), [props.held, gen])
  useEffect(() => {
    if (props.scatterToken) ctrlRef.current?.scatter()
  }, [props.scatterToken])
  useEffect(
    () => ctrlRef.current?.setReducedMotion(props.reducedMotion),
    [props.reducedMotion, gen],
  )
  useEffect(
    () => ctrlRef.current?.setDebug(!!props.debug, props.accentColor),
    [props.debug, props.accentColor, gen],
  )
  useImperativeHandle(props.ref, () => ({ capture: () => ctrlRef.current?.capture() ?? null }), [])

  return (
    <div ref={hostRef} className={props.className} style={{ position: 'absolute', inset: 0 }} />
  )
}
