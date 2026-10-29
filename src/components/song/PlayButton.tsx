import { useRef } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import { useFeatureFrames } from '~/audio/useLiveFeatures'
import { Kbd } from '~/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'

const PLAY_BUTTON_ID = 'play-button'

// True while focusPlayButton() moves focus; a prevented focus event keeps the tooltip shut.
let focusingQuietly = false

/** The page's one filled control. The ring around it is the loop's progress, in the signal colour. */
export function PlayButton() {
  const api = useAudioApi()
  const snap = useAudioSnapshot()
  const ring = useRef<SVGCircleElement>(null)
  const { state } = snap

  useFeatureFrames((f) => {
    ring.current?.setAttribute('stroke-dashoffset', String(1 - f.loopPosition))
  }, state === 'playing')

  const label =
    state === 'error'
      ? COPY.errorRetry
      : state === 'playing' || (state === 'loading' && snap.unlocked)
        ? COPY.pauseAria
        : COPY.playAria
  const icon = state === 'error' ? 'retry' : label === COPY.pauseAria ? 'pause' : 'play'

  return (
    <div className="transport flex flex-none flex-col items-center no-js:hidden split:gap-[13px]">
      <Tooltip>
        <TooltipTrigger asChild onFocus={(e) => focusingQuietly && e.preventDefault()}>
          <button
            id={PLAY_BUTTON_ID}
            type="button"
            className="play-btn group/play relative grid size-(--pb) flex-none place-items-center rounded-[50%] [--pb:48px] focus-visible:outline-offset-8 field:[--pb:44px] split:[--pb:56px]"
            data-state={state}
            aria-label={label}
            onClick={() => (state === 'error' ? api.retry() : api.toggle())}
          >
            <svg
              className="play-btn__ring pointer-events-none absolute inset-[calc(var(--pb)*-0.0893)] size-[calc(100%+var(--pb)*0.1786)] max-w-none -rotate-90 overflow-visible fill-none"
              viewBox="0 0 66 66"
              aria-hidden="true"
            >
              <circle className="play-btn__track stroke-line stroke-1" cx="33" cy="33" r="32" />
              <circle
                ref={ring}
                className="play-btn__progress stroke-signal stroke-2 group-data-[state=loading]/play:opacity-0"
                cx="33"
                cy="33"
                r="32"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset="1"
              />
              <circle
                className={cn(
                  'play-btn__spinner origin-[33px_33px] stroke-ink-2 stroke-2 opacity-0 [stroke-linecap:round]',
                  'group-data-[state=loading]/play:opacity-100 motion-safe:group-data-[state=loading]/play:animate-spin',
                  'motion-reduce:group-data-[state=loading]/play:[stroke-dasharray:0.03_0.03] motion-reduce:group-data-[state=loading]/play:[stroke-linecap:butt]',
                )}
                cx="33"
                cy="33"
                r="32"
                pathLength={1}
                strokeDasharray="0.22 0.78"
              />
            </svg>
            <span className="play-btn__disc grid size-full place-items-center rounded-[50%] bg-ink text-ground transition-[scale] duration-(--dur-1) ease-out group-active/play:scale-96">
              <Icon name={icon} size={22} className="size-[46%]" />
            </span>
          </button>
        </TooltipTrigger>
        {/* Clears the 8px-offset focus ring by as much as the other tooltips clear theirs. */}
        <TooltipContent aria-label="Shortcut: Space" sideOffset={10}>
          {label}
          <Kbd>Space</Kbd>
        </TooltipContent>
      </Tooltip>
      <p
        className="state-text font-mono text-2xs leading-[1.2] font-medium tracking-label whitespace-nowrap text-ink-3 uppercase group-data-[state=error]/song:text-ink-2 strip:sr-only"
        role="status"
      >
        {stateText(state, snap.muted)}
      </p>
    </div>
  )
}

/**
 * Hands focus to the play button without its shortcut tooltip, which would otherwise stay open
 * over the zone labels for as long as focus rests there.
 */
export function focusPlayButton() {
  focusingQuietly = true
  document.getElementById(PLAY_BUTTON_ID)?.focus()
  focusingQuietly = false
}

function stateText(state: string, muted: boolean): string {
  switch (state) {
    case 'loading':
      return COPY.stateLoading
    case 'playing':
      return muted ? COPY.stateMuted : COPY.statePlaying
    case 'paused':
      return COPY.statePaused
    case 'error':
      return COPY.stateError
    default:
      return COPY.stateReady
  }
}
