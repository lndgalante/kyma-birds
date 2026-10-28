import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import { COPY, nowPlayingAria } from '~/lib/copy'
import { getBirds } from '~/lib/manifest'
import { AboutDialog } from './AboutDialog'
import { Icon } from './Icon'
import { Wordmark } from './Wordmark'

interface MastheadProps {
  /** 'instrument' is a bar in Split/Stacked and overlays the photo in Field (pure CSS); 'page' is always a bar. */
  variant: 'instrument' | 'page'
  /** Bird to keep selected when following the wordmark home. */
  bird?: string
}

export function Masthead({ variant, bird }: MastheadProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <>
      <header className={`masthead masthead--${variant}`}>
        <div className="masthead__inner">
          <Wordmark bird={bird} />
          {variant === 'instrument' ? (
            <p className="masthead__hint">
              <kbd>Space</kbd> to play
              <span className="masthead__dot" aria-hidden="true">
                ·
              </span>
              <kbd>
                <Icon name="arrow-left" size={11} aria-label="Left arrow" role="img" />
              </kbd>
              <kbd>
                <Icon name="arrow-right" size={11} aria-label="Right arrow" role="img" />
              </kbd>{' '}
              to change bird
            </p>
          ) : (
            <NowPlaying />
          )}
          <nav className="masthead__nav" aria-label="Site">
            <button type="button" className="nav-link" onClick={() => setAboutOpen(true)}>
              {COPY.navAbout}
            </button>
            <Link
              to="/credits"
              search={bird ? { bird } : {}}
              hash={bird}
              className="nav-link"
              activeProps={{ 'aria-current': 'page' }}
            >
              {COPY.navCredits}
            </Link>
          </nav>
        </div>
      </header>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} bird={bird} />
    </>
  )
}

/** On pages other than the instrument, a song that keeps playing stays one press from silence. */
function NowPlaying() {
  const api = useAudioApi()
  const snap = useAudioSnapshot()
  const bird = getBirds().find((b) => b.slug === (snap.playingId ?? snap.songId))
  if (!bird || !snap.unlocked || (snap.state !== 'playing' && snap.state !== 'paused')) return null
  const playing = snap.state === 'playing'
  return (
    <button
      type="button"
      className="now-playing"
      aria-label={playing ? nowPlayingAria(bird.commonName) : `Play ${bird.commonName}`}
      onClick={() => (playing ? api.pause() : api.play())}
    >
      <span className="now-playing__icon">
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </span>
      <span className="now-playing__name">{bird.commonName}</span>
    </button>
  )
}
