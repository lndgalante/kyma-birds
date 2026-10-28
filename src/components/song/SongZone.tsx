import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { COPY, spectrumAria } from '~/lib/copy'
import { formatBandSpoken, formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
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
    <section className="zone zone--song" aria-labelledby="zone-song" data-state={state}>
      <header className="zone-head">
        <h2 id="zone-song" className="zone-title">
          <span className="zone-num" aria-hidden="true">
            02
          </span>{' '}
          {COPY.zoneSong}
        </h2>
        <FlowLine />
      </header>
      <div className="song-body">
        <span className="zone-tag" aria-hidden="true">
          <span className="zone-num">02</span> {COPY.zoneSong}
        </span>
        <PlayButton />
        {state === 'error' ? (
          <div className="song-error">
            <p className="song-error__text">{COPY.errorInline}</p>
            {error !== 'unsupported' && (
              <button type="button" className="btn btn--sm" onClick={() => api.retry()}>
                {COPY.errorRetry}
              </button>
            )}
          </div>
        ) : (
          <Spectrum band={bird.audio.bandHz} peakHz={bird.audio.peakHz} label={label} />
        )}
        <SignalReadout />
        <noscript>
          <audio
            className="noscript-audio"
            controls
            loop
            preload="none"
            src={bird.audio.src}
            aria-label={COPY.noscriptAudio}
          />
        </noscript>
      </div>
      <div className="song-foot">
        <VolumeControl />
      </div>
    </section>
  )
}
