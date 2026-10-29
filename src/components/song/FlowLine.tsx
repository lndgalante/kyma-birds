import { useAudioField } from '~/audio/useAudio'
import { cn } from '~/lib/utils'

/**
 * The wire between zones: a hairline and arrowhead; a slow dash in the signal colour runs along
 * it while playing.
 */
export function FlowLine() {
  const state = useAudioField('state')
  return (
    <span
      className={cn(
        // min-w-2: short enough that "02 Song" fits whole in the narrowest (104px) spine.
        'flow-line relative me-[3px] h-px min-w-2 flex-auto bg-line-2 bg-repeat-x',
        'after:absolute after:top-0 after:-right-[3px] after:size-0 after:-translate-y-1/2 after:border-y-[3.5px] after:border-s-[5px] after:border-y-transparent after:border-s-ink-3 after:transition-[border-color] after:duration-(--dur-2) after:ease-out',
        'data-live:bg-[repeating-linear-gradient(90deg,var(--signal)_0_10px,transparent_10px_24px)] data-live:bg-size-[48px_1px] data-live:after:border-s-signal motion-safe:data-live:animate-flow-dash',
      )}
      aria-hidden="true"
      data-live={state === 'playing' || undefined}
    />
  )
}
