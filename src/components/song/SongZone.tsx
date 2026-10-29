import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { Button } from '~/components/ui/button'
import { COPY, spectrumAria } from '~/lib/copy'
import { formatBandSpoken, formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { ZoneHead, ZoneTag } from '../shell/Zone'
import { FlowLine } from './FlowLine'
import { PlayButton } from './PlayButton'
import { SignalReadout } from './SignalReadout'
import { Spectrum } from './Spectrum'
import { VolumeControl } from './VolumeControl'

/** 02 Song: a vertical spine between card and plate in Split, a horizontal strip elsewhere (pure CSS). */
export function SongZone({ bird }: { bird: Bird }) {
  const state = useAudioField('state')
  const error = useAudioField('error')
  const api = useAudioApi()
  const label = spectrumAria(
    formatBandSpoken(bird.audio.bandHz),
    formatHzShort(bird.audio.peakHz).replace(' ', ' '),
  )
  return (
    <section
      className={cn(
        'zone zone--song group/song relative z-2 -mt-(--strip-h) flex h-(--strip-h) items-center gap-3 border-line ps-[max(var(--gutter),var(--safe-l))] pe-[max(var(--gutter),var(--safe-r))] *:min-w-0',
        'field:gap-2.5',
        'stacked:mt-0 stacked:border-y stacked:px-0',
        'split:col-start-2 split:row-span-full split:grid split:h-auto split:grid-rows-[var(--zone-head)_minmax(0,1fr)_var(--zone-foot)] split:items-stretch split:gap-0 split:gap-y-(--row-gap) split:border-x split:border-y-0',
        'compact:col-start-1 compact:row-start-2 compact:border-y-0',
      )}
      aria-labelledby="zone-song"
      data-state={state}
    >
      <ZoneHead id="zone-song" num="02" title={COPY.zoneSong} className="split:ps-3 split:pe-1.5">
        <FlowLine />
      </ZoneHead>
      <div className="song-body contents no-js:[&>noscript]:contents split:flex split:min-h-0 split:flex-col split:items-center split:gap-[18px] split:px-2.5 split:pt-3 split:pb-1">
        <ZoneTag num="02" title={COPY.zoneSong} className="me-1" />
        <PlayButton />
        {state === 'error' ? (
          <div className="song-error flex min-w-0 flex-auto items-center gap-2.5 split:flex-col split:justify-center split:text-center">
            <p className="song-error__text text-sm leading-[1.35] text-ink-2">{COPY.errorInline}</p>
            {error !== 'unsupported' && (
              <Button size="sm" className="btn btn--sm" onClick={() => api.retry()}>
                {COPY.errorRetry}
              </Button>
            )}
          </div>
        ) : (
          <Spectrum band={bird.audio.bandHz} peakHz={bird.audio.peakHz} label={label} />
        )}
        <SignalReadout />
        {/* Without JS this <noscript> is an ordinary box, so song-body's
            `no-js:[&>noscript]:contents` makes the player the flex item. With JS its content is
            raw text, which `contents` would show. In Split the plate's no-JS message carries the
            player instead. */}
        <noscript>
          <audio
            className="noscript-audio block w-full max-w-full min-w-0 flex-[0_1_auto] split:hidden"
            controls
            loop
            preload="none"
            src={bird.audio.src}
            aria-label={COPY.noscriptAudio}
          />
        </noscript>
      </div>
      <div className="song-foot contents border-line split:flex split:items-center split:justify-center split:border-t split:px-1.5">
        <VolumeControl />
      </div>
    </section>
  )
}
