import { useState } from 'react'
import { useAudioApi } from '~/audio/useAudio'
import { describeMode } from '~/cymatics'
import { COPY, describeSay, describeSayHeld, plateCaptionHeld } from '~/lib/copy'
import { NBSP, formatHz } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { useAnnounce } from '../shell/SrStatus'
import { ModeReadout } from './ModeReadout'
import { PlateControls } from './PlateControls'
import { PlateFigure } from './PlateFigure'
import { usePlateCaption } from './usePlateCaption'

interface PlateZoneProps {
  bird: Bird
}

export function PlateZone({ bird }: PlateZoneProps) {
  const api = useAudioApi()
  const announce = useAnnounce()
  const [held, setHeld] = useState(false)
  const [scatterToken, setScatterToken] = useState(0)
  const caption = usePlateCaption(held)

  const onDescribe = () => {
    // While held, describe the frozen pattern on screen; it no longer follows the song.
    if (held) {
      const key = caption.modeKey
      announce(key ? describeSayHeld(describeMode('circle', key)) : `${plateCaptionHeld('')}.`)
      return
    }
    const key = api.getModeKey()
    if (!key) {
      // Same words as the caption: "Paused" when paused (say, after Scatter), else "Waiting for sound".
      announce(`${caption.text}.`)
      return
    }
    const hz = api.features().dominantHz ?? api.getTelemetry()?.dominantHz ?? null
    announce(describeSay(describeMode('circle', key), hz ? formatHz(hz).replace(NBSP, ' ') : ''))
  }

  return (
    <section className="zone zone--plate" aria-labelledby="zone-plate">
      <header className="zone-head">
        <h2 id="zone-plate" className="zone-title">
          <span className="zone-num" aria-hidden="true">
            03
          </span>{' '}
          {COPY.zonePlate}
        </h2>
        <ModeReadout placement="head" />
      </header>
      <div className="plate-body">
        <PlateFigure
          bird={bird}
          held={held}
          scatterToken={scatterToken}
          caption={caption.text}
          captionKind={caption.kind}
        />
      </div>
      <div className="plate-foot">
        <span className="zone-tag" aria-hidden="true">
          <span className="zone-num">03</span> {COPY.zonePlate}
        </span>
        <ModeReadout placement="foot" caption={caption} />
        <PlateControls
          held={held}
          onHeldChange={setHeld}
          onScatter={() => setScatterToken((t) => t + 1)}
          onDescribe={onDescribe}
        />
      </div>
    </section>
  )
}
