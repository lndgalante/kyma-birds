import { useState } from 'react'
import { useAudioApi } from '~/audio/useAudio'
import { describeMode } from '~/cymatics'
import { COPY, describeSay, describeSayHeld, plateCaptionHeld } from '~/lib/copy'
import { NBSP, formatHz } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { useAnnounce } from '../shell/SrStatus'
import { ZoneHead, ZoneTag } from '../shell/Zone'
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
    <section
      className={cn(
        'zone zone--plate grid justify-items-center gap-y-3 pt-4 ps-[max(var(--gutter),var(--safe-l))] pe-[max(var(--gutter),var(--safe-r))] *:min-w-0',
        'stacked:px-0 stacked:pt-1',
        'split:col-start-3 split:row-span-full split:grid-rows-[var(--zone-head)_minmax(0,1fr)_var(--zone-foot)] split:justify-items-stretch split:gap-y-(--row-gap) split:p-0',
        'compact:col-start-2 compact:row-[1/span_3] compact:content-start compact:p-0',
      )}
      aria-labelledby="zone-plate"
    >
      <ZoneHead id="zone-plate" num="03" title={COPY.zonePlate} className="justify-between">
        <ModeReadout placement="head" />
      </ZoneHead>
      <div className="plate-body split:grid split:min-h-0 split:place-items-center">
        <PlateFigure
          bird={bird}
          held={held}
          scatterToken={scatterToken}
          caption={caption.text}
          captionKind={caption.kind}
        />
      </div>
      <div
        className={cn(
          'plate-foot flex w-full min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-2.5',
          'foot-row:h-12 foot-row:flex-nowrap foot-row:justify-start',
          'field-or-compact:flex-col field-or-compact:gap-2',
          'split:h-auto split:justify-end',
        )}
      >
        <ZoneTag num="03" title={COPY.zonePlate} />
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
