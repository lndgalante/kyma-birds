import { useRef } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import { useFeatureFrames } from '~/audio/useLiveFeatures'
import { COPY } from '~/lib/copy'
import { Icon } from '../shell/Icon'

export const PLAY_BUTTON_ID = 'play-button'

/** The page's one filled control. The ring around it is the loop's progress, in the accent. */
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
    <div className="transport">
      <button
        id={PLAY_BUTTON_ID}
        type="button"
        className="play-btn"
        data-state={state}
        aria-label={label}
        onClick={() => (state === 'error' ? api.retry() : api.toggle())}
      >
        <svg className="play-btn__ring" viewBox="0 0 66 66" aria-hidden="true">
          <circle className="play-btn__track" cx="33" cy="33" r="32" />
          <circle
            ref={ring}
            className="play-btn__progress"
            cx="33"
            cy="33"
            r="32"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
          />
          <circle
            className="play-btn__spinner"
            cx="33"
            cy="33"
            r="32"
            pathLength={1}
            strokeDasharray="0.22 0.78"
          />
        </svg>
        <span className="play-btn__disc">
          <Icon name={icon} size={22} />
        </span>
      </button>
      <p className="state-text" role="status">
        {stateText(state, snap.muted)}
      </p>
    </div>
  )
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
