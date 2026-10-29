import { useEffect, useState } from 'react'
import { useAudioField } from '~/audio/useAudio'
import { LIT } from '~/components/ui/surface'
import { COPY, gateAria } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'

/** Where the Listen skip link (routes/index.tsx) moves focus. */
export const GATE_BUTTON_ID = 'listen'

interface ListenGateProps {
  birdName: string
  loading: boolean
  exiting: boolean
  onListen(): void
}

/**
 * Not a modal: centred over the plate while the rest of the page stays usable (ui.md §5.2). Its
 * disc is the page's one lit control; behind it the bird's colour breathes on the plate, slowly,
 * a few times, then rests. The disc itself never moves until it is pressed. Its line says
 * whether sound will come: mute is remembered between visits, and the strip that shows it waits
 * until Listen.
 */
export function ListenGate({ birdName, loading, exiting, onListen }: ListenGateProps) {
  const muted = useAudioField('muted')
  // Only a decode slower than 150 ms earns the loading arc; faster ones would just flicker.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), 150)
    return () => window.clearTimeout(id)
  }, [loading])

  return (
    <div
      className={cn(
        'gate group/gate absolute inset-0 z-3 @container-size/gate rounded-[inherit] text-center [--disc:112px] field:[--disc:88px]',
        // The gate fades while the sand lifts under it (PlateFigure waits as long).
        'transition-opacity duration-(--dur-5) ease-out data-exiting:pointer-events-none data-exiting:opacity-0',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:scrim-gate',
        'no-js:hidden',
      )}
      data-exiting={exiting || undefined}
      data-loading={slow || undefined}
      // Leaving: out of the tab order and the accessibility tree while it fades.
      inert={exiting}
    >
      {/* The breath: the bird's colour, a soft pool behind the disc. Still under reduced motion. */}
      <span
        className={cn(
          'gate__breath pointer-events-none absolute top-1/2 left-1/2 size-[72%] -translate-1/2 rounded-full',
          'bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--signal)_32%,transparent),color-mix(in_oklch,var(--signal)_11%,transparent)_55%,transparent)]',
          'scale-96 opacity-35 motion-safe:animate-breathe motion-reduce:scale-100 motion-reduce:opacity-50',
        )}
        aria-hidden="true"
      />
      {/* The disc sits on the plate's centre, with its label and the line below hanging under
          it: the lift is half the disc plus the button's 6px padding. */}
      <div className="gate__stack absolute inset-x-0 top-1/2 grid justify-items-center gap-2.5 translate-y-[calc(var(--disc)/-2_-_6px)]">
        <button
          id={GATE_BUTTON_ID}
          type="button"
          className="gate__btn group/btn relative grid justify-items-center gap-3.5 rounded-bed p-1.5 text-ink"
          aria-label={gateAria(birdName)}
          aria-describedby="gate-sub"
          onClick={onListen}
        >
          <span
            className={cn(
              'gate__disc relative grid size-(--disc) place-items-center rounded-full',
              LIT,
              'transition-[filter,scale] duration-(--dur-1) ease-out group-hover/btn:brightness-105 group-active/btn:scale-96',
              'forced-colors:border forced-colors:border-[ButtonText]',
            )}
          >
            <svg
              className={cn(
                'gate__arc absolute -inset-[7px] size-[calc(100%+14px)] max-w-none fill-none stroke-ink-2 stroke-2 [stroke-linecap:round] opacity-0',
                'group-data-loading/gate:opacity-100 motion-safe:group-data-loading/gate:animate-spin motion-reduce:group-data-loading/gate:[stroke-dasharray:0.02_0.02]',
              )}
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="47" pathLength={1} strokeDasharray="0.25 0.75" />
            </svg>
            {/* The play frame (Icon FRAMES) already centres the triangle by its weight. */}
            <Icon name="play" size={34} className="field:size-7" />
          </span>
          <span className="gate__label font-display-medium text-lg leading-none tracking-title text-ink">
            {slow ? COPY.gateLoading : COPY.gateButton}
          </span>
        </button>
        {/* On a small plate this line would run off the edge; it stays the button's description. */}
        <p
          id="gate-sub"
          className="gate__sub relative max-w-[28ch] text-sm leading-[1.4] text-balance text-ink-2 gate-short:sr-only"
        >
          {muted ? COPY.gateSubMuted : COPY.gateSub}
        </p>
      </div>
    </div>
  )
}
