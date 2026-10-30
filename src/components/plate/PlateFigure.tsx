import { ClientOnly } from '@tanstack/react-router'
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode, type Ref } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import type { PlateBird, PlateError, PlateHandle } from '~/cymatics'
import { COPY, plateAria } from '~/lib/copy'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { focusPlayButton } from '../song/PlayButton'
import { LazyCymaticsPlate } from './CymaticsPlate'
import { ListenGate } from './ListenGate'
import { POSTER_MESSAGE, PlatePoster } from './PlatePoster'

interface PlateFigureProps {
  bird: Bird
  held: boolean
  scatterToken: number
  /** Each increment lightens the plate for a moment, as a camera shutter would. */
  photoToken: number
  plateRef: Ref<PlateHandle>
  caption: string
  captionKind: string
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

type GatePhase = 'shown' | 'exiting' | 'gone'

export function PlateFigure({
  bird,
  held,
  scatterToken,
  photoToken,
  plateRef,
  caption,
  captionKind,
}: PlateFigureProps) {
  const api = useAudioApi()
  const snap = useAudioSnapshot()
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [plateError, setPlateError] = useState<PlateError | null>(null)
  const [gate, setGate] = useState<GatePhase>('shown')
  const engine = api.engine()

  const plateBird = useMemo<PlateBird>(
    () => ({ id: bird.slug, bandHz: bird.audio.bandHz, peakHz: bird.audio.peakHz }),
    [bird.slug, bird.audio.bandHz, bird.audio.peakHz],
  )

  // The gate leaves once sound has actually started (or can't); it never comes back this visit.
  const settled = snap.state === 'playing' || snap.state === 'paused' || snap.state === 'error'
  const blocked = snap.state === 'error' && !snap.unlocked && snap.error !== 'unsupported'
  useEffect(() => {
    if (gate === 'shown' && settled && !blocked) setGate('exiting')
  }, [gate, settled, blocked])
  useEffect(() => {
    if (gate !== 'exiting') return
    // The gate's own fade (ListenGate, --dur-5).
    const id = window.setTimeout(() => setGate('gone'), reducedMotion ? 0 : 700)
    return () => window.clearTimeout(id)
  }, [gate, reducedMotion])

  const onListen = () => {
    // Read before listen() re-renders. Chrome and Firefox focus a button on mouse click too, so
    // only a keyboard activation (:focus-visible) counts.
    const a = document.activeElement
    const fromKeyboard = a?.closest('.gate') != null && a.matches(':focus-visible')
    void api.listen()
    // Keyboard users land on Pause, ready to stop what they just started.
    if (fromKeyboard) focusPlayButton()
  }

  const failed = plateError != null
  return (
    <figure
      className="plate-figure group/figure relative m-0 aspect-square w-(--plate)"
      aria-labelledby="plate-caption"
      data-ready={(ready && !failed) || undefined}
    >
      {/* The frame paints the plate's surface and rim (plate-disc) for the poster and the canvas
          alike; the canvas draws only the sand over it. */}
      <div className="plate-frame absolute inset-0 overflow-clip rounded-[50%] plate-disc">
        <PlatePoster message={failed ? COPY.plateFallbackWebgl : undefined} />
        <noscript>
          <div
            className={cn(
              POSTER_MESSAGE,
              'plate-poster__msg--nojs absolute top-1/2 left-1/2 -translate-1/2',
            )}
          >
            {/* The native player is in the song strip. */}
            <p>{COPY.plateFallbackNojs}</p>
          </div>
        </noscript>
        <div
          className="plate-canvas absolute inset-0 z-1 size-full"
          role="img"
          aria-label={plateAria(bird.commonName)}
          aria-describedby="plate-desc"
        >
          {/* Keep the poster until Listen, so WebGL loading and setup never delay the page. */}
          {!failed && snap.unlocked && engine && (
            <ClientOnly>
              <PlateBoundary onError={setPlateError}>
                <Suspense fallback={null}>
                  <LazyCymaticsPlate
                    ref={plateRef}
                    source={engine.driveSource}
                    bird={plateBird}
                    plateShape="circle"
                    paused={snap.state !== 'playing'}
                    held={held}
                    scatterToken={scatterToken}
                    reducedMotion={reducedMotion}
                    className="plate-host [&_canvas]:block"
                    onReady={() => setReady(true)}
                    onError={(e) => {
                      console.warn('[plate]', e.code, e.message)
                      if (!e.recoverable) setPlateError(e)
                      else setReady(false)
                    }}
                    onTelemetry={api.setTelemetry}
                  />
                </Suspense>
              </PlateBoundary>
            </ClientOnly>
          )}
        </div>
        {photoToken > 0 && (
          <span
            key={photoToken}
            className="plate-flash pointer-events-none absolute inset-0 z-2 bg-plate-sand opacity-0 motion-safe:animate-shutter"
            aria-hidden="true"
          />
        )}
      </div>
      {gate !== 'gone' && (
        <ListenGate
          birdName={bird.commonName}
          loading={snap.state === 'loading'}
          exiting={gate === 'exiting'}
          onListen={onListen}
        />
      )}
      {/* The plate's full status, for screen readers; the foot row shows the eye only an error. */}
      <figcaption id="plate-caption" className="plate-caption sr-only" data-kind={captionKind}>
        {caption}
      </figcaption>
      <p id="plate-desc" className="sr-only">
        {COPY.plateDesc}
      </p>
    </figure>
  )
}

/** A failed chunk load or a render-time throw degrades to the poster, never a blank page. */
class PlateBoundary extends Component<
  { onError(e: PlateError): void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    this.props.onError({
      code: 'init-failed',
      recoverable: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
