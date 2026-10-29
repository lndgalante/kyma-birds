import { ClientOnly } from '@tanstack/react-router'
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import type { PlateDriveSource } from '~/audio/engine'
import type { PlateBird, PlateError } from '~/cymatics'
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
  caption: string
  captionKind: string
}

// Until the engine exists (or if it never can), the plate reads silence.
const SILENT_SOURCE: PlateDriveSource = {
  read(_now, out) {
    out.audible = false
    out.drive = 0
    out.voiced = false
    return out
  },
  isAudible: () => false,
  subscribe: () => () => {},
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

export function PlateFigure({ bird, held, scatterToken, caption, captionKind }: PlateFigureProps) {
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
    const id = window.setTimeout(() => setGate('gone'), reducedMotion ? 0 : 320)
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
      <div className="plate-frame absolute inset-0 overflow-clip rounded-[50%] bg-plate-surface shadow-plate">
        <PlatePoster message={failed ? COPY.plateFallbackWebgl : undefined} />
        <noscript>
          <div
            className={cn(
              POSTER_MESSAGE,
              'plate-poster__msg--nojs absolute top-1/2 left-1/2 -translate-1/2 split:w-[min(340px,80%)] split:max-w-none',
            )}
          >
            <p>{COPY.plateFallbackNojs}</p>
            {/* Split only: the 108px song spine is too narrow for a native player. */}
            <audio
              className="noscript-audio noscript-audio--plate mt-2.5 hidden w-full max-w-full min-w-0 split:block"
              controls
              loop
              preload="none"
              src={bird.audio.src}
              aria-label={COPY.noscriptAudio}
            />
          </div>
        </noscript>
        <div
          className="plate-canvas absolute inset-0 z-1 size-full"
          role="img"
          aria-label={plateAria(bird.commonName)}
          aria-describedby="plate-desc"
        >
          {!failed && (
            <ClientOnly>
              <PlateBoundary onError={setPlateError}>
                <Suspense fallback={null}>
                  <LazyCymaticsPlate
                    // The controller takes its source once; remount when the engine appears.
                    key={engine ? 'engine' : 'silent'}
                    source={engine?.driveSource ?? SILENT_SOURCE}
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
      </div>
      {gate !== 'gone' && (
        <ListenGate
          birdName={bird.commonName}
          loading={snap.state === 'loading'}
          exiting={gate === 'exiting'}
          onListen={onListen}
        />
      )}
      {/* Outside Split the plate is too small for a corner caption; the foot row carries it. */}
      <figcaption
        id="plate-caption"
        className={cn(
          'plate-caption pointer-events-none absolute start-0 bottom-0 z-2 max-w-[22ch] font-mono text-2xs leading-[1.3] font-medium tracking-label text-ink-3 uppercase',
          'strip:sr-only',
          // While live, the head row already reads "Mode (3, 2)"; the corner speaks only for states.
          'split:transition-opacity split:duration-(--dur-2) split:ease-out split:data-[kind=live]:opacity-0',
        )}
        data-kind={captionKind}
      >
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
