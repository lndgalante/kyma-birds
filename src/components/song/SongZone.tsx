import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { Button } from '~/components/ui/button'
import { BED, PANEL } from '~/components/ui/surface'
import { COPY, spectrumAria } from '~/lib/copy'
import { NBSP, formatBandSpoken, formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { ZoneHead } from '../shell/Zone'
import { PlayButton } from './PlayButton'
import { SignalReadout } from './SignalReadout'
import { Spectrum } from './Spectrum'
import { VolumeControl } from './VolumeControl'

/**
 * The song strip, the one panel on the page: the play cap, the spectrum sunk in its bed, the
 * readout and the volume, in a row. It sits under the photo on phones, under the picker in
 * Stacked, and at the foot of the bird column in Split, level with the plate's foot row.
 */
export function SongZone({ bird }: { bird: Bird }) {
  const state = useAudioField('state')
  const error = useAudioField('error')
  const api = useAudioApi()
  const label = spectrumAria(
    formatBandSpoken(bird.audio.bandHz),
    formatHzShort(bird.audio.peakHz).replace(NBSP, ' '),
  )
  return (
    <section
      className={cn(
        // The strip's ends: the cap's ring as far from the start as from the top and bottom.
        'zone zone--song group/song relative flex h-(--strip-h) items-center gap-2 ps-2.5 pe-2.5 @container/song *:min-w-0',
        PANEL,
        'ms-[max(var(--gutter),var(--safe-l))] me-[max(var(--gutter),var(--safe-r))] mt-3',
        'stacked:mx-0 stacked:mt-0 stacked:gap-4 stacked:pe-4',
        'split:col-start-1 split:row-start-2',
        'compact:col-start-1 compact:row-start-2 compact:gap-3 compact:ps-2 compact:pe-2',
      )}
      aria-labelledby="zone-song"
      data-state={state}
    >
      <ZoneHead id="zone-song" title={COPY.zoneSong} />
      <div className="song-body contents no-js:[&>noscript]:contents">
        <PlayButton />
        {state === 'error' ? (
          <div className="song-error flex min-w-0 flex-auto items-center gap-2.5">
            <p className="song-error__text text-sm leading-[1.4] text-ink-2">{COPY.errorInline}</p>
            {error !== 'unsupported' && (
              <Button size="sm" className="btn btn--sm" onClick={() => api.retry()}>
                {COPY.errorRetry}
              </Button>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'spectrum-bed flex h-12 min-w-0 flex-auto px-2 py-1 no-js:hidden forced-colors:hidden',
              BED,
            )}
          >
            <Spectrum band={bird.audio.bandHz} peakHz={bird.audio.peakHz} label={label} />
          </div>
        )}
        <SignalReadout peakHz={bird.audio.peakHz} />
        {/* Without JS this <noscript> is an ordinary box, so song-body's
            `no-js:[&>noscript]:contents` makes the player the flex item. With JS its content is
            raw text, which `contents` would show. */}
        <noscript>
          <audio
            className="noscript-audio block w-full max-w-full min-w-0 flex-[0_1_auto]"
            controls
            loop
            preload="none"
            src={bird.audio.src}
            aria-label={COPY.noscriptAudio}
          />
        </noscript>
      </div>
      <div className="song-foot contents">
        <VolumeControl />
      </div>
    </section>
  )
}
