import { useAudioApi, useAudioField, useAwake } from '~/audio/useAudio'
import { Button } from '~/components/ui/button'
import { BED, PANEL } from '~/components/ui/surface'
import { COPY, spectrumAria } from '~/lib/copy'
import { NBSP, formatBandSpoken, formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { ZoneHead } from '../shell/Zone'
import { PlayButton, SONG_ERROR_ID, focusPlayButton } from './PlayButton'
import { Spectrum } from './Spectrum'
import { VolumeControl } from './VolumeControl'

/**
 * The song strip, the one panel on the page: the play cap, the spectrum sunk in its bed and the
 * volume, in a row. It sits under the photo on phones, under the picker in Stacked, and at the
 * foot of the bird column in Split, level with the plate's foot row.
 *
 * With JS the strip waits, invisible in its reserved row, until the first Listen press, so Listen
 * is the page's one first action; then it fades in and stays. An error shows it at once, with
 * its retry. Without JS it holds the native player from the start.
 */
export function SongZone({ bird }: { bird: Bird }) {
  const state = useAudioField('state')
  const error = useAudioField('error')
  const awake = useAwake()
  const api = useAudioApi()
  const label = spectrumAria(
    formatBandSpoken(bird.audio.bandHz),
    formatHzShort(bird.audio.peakHz).replace(NBSP, ' '),
  )
  return (
    <section
      className={cn(
        // The strip's ends: the cap's ring as far from the start as from the top and bottom, so
        // it sits concentric in the capsule; the end mirrors it.
        'zone zone--song group/song relative flex h-(--strip-h) items-center gap-2 ps-2.5 pe-2.5 @container/song *:min-w-0',
        PANEL,
        'ms-[max(var(--gutter),var(--safe-l))] me-[max(var(--gutter),var(--safe-r))] mt-3',
        'stacked:mx-0 stacked:mt-0 stacked:gap-4',
        'split:col-start-1 split:row-start-2',
        'compact:col-start-1 compact:row-start-2 compact:gap-3 compact:ps-2 compact:pe-2',
        // Visibility flips at once, so the Listen press can hand focus to the cap; the opacity
        // fades.
        'transition-opacity duration-(--dur-5) ease-out js:not-data-awake:invisible js:not-data-awake:opacity-0',
      )}
      aria-labelledby="zone-song"
      data-state={state}
      data-awake={awake || undefined}
    >
      <ZoneHead id="zone-song" title={COPY.zoneSong} />
      <div className="song-body contents no-js:[&>noscript]:contents">
        <PlayButton />
        {state === 'error' ? (
          <div className="song-error flex min-w-0 flex-auto items-center gap-2.5">
            <p id={SONG_ERROR_ID} className="song-error__text text-sm leading-[1.4] text-ink-2">
              {error === 'unsupported' ? COPY.errorUnsupported : COPY.errorInline}
            </p>
            {error !== 'unsupported' && (
              <Button
                size="sm"
                className="btn btn--sm"
                // This row leaves while the song reloads; the cap stays, and is the retry while
                // the error lasts, so focus waits there.
                onClick={() => {
                  focusPlayButton()
                  api.retry()
                }}
              >
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
