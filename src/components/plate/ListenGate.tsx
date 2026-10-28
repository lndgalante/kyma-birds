import { useEffect, useState } from 'react'
import { COPY, gateAria } from '~/lib/copy'
import { Icon } from '../shell/Icon'

interface ListenGateProps {
  birdName: string
  loading: boolean
  exiting: boolean
  onListen(): void
}

/** Not a modal: centred over the plate while the rest of the page stays usable (ui.md §5.2). */
export function ListenGate({ birdName, loading, exiting, onListen }: ListenGateProps) {
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
    <div className="gate" data-exiting={exiting || undefined} data-loading={slow || undefined}>
      <div className="gate__stack">
        <button
          type="button"
          className="gate__btn"
          aria-label={gateAria(birdName)}
          aria-describedby="gate-sub"
          onClick={onListen}
        >
          <span className="gate__disc">
            <span className="gate__pulse" aria-hidden="true" />
            <span className="gate__pulse" aria-hidden="true" />
            <span className="gate__pulse" aria-hidden="true" />
            <svg className="gate__arc" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="47" pathLength={1} strokeDasharray="0.25 0.75" />
            </svg>
            <Icon name="play" size={34} />
          </span>
          <span className="gate__label">{slow ? COPY.gateLoading : COPY.gateButton}</span>
        </button>
        <p id="gate-sub" className="gate__sub">
          {COPY.gateSub}
        </p>
      </div>
    </div>
  )
}
