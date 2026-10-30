import { Link } from '@tanstack/react-router'
import { Suspense, lazy, useState } from 'react'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import { Button } from '~/components/ui/button'
import { PART } from '~/components/ui/surface'
import { COPY, nowPlayingAria } from '~/lib/copy'
import { getBirds } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { IconSwap } from './IconButton'
import { Wordmark } from './Wordmark'

const AboutDialog = lazy(() => import('./AboutDialog').then((m) => ({ default: m.AboutDialog })))

/**
 * Field and Compact landscape: the masthead floats over the photo, under a short scrim for bright
 * skies; in Compact it spans the card column only, inset like the card so the glyph sits on the
 * photo rather than across its rounded corner. Stacked and Split: a bar.
 */
const INSTRUMENT = cn(
  'masthead--instrument absolute inset-x-0 top-0 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-bottom-6 before:scrim-mast',
  'stacked:relative stacked:bg-ground stacked:shadow-[inset_0_-1px_0_var(--line)] stacked:before:content-none',
  "compact:absolute compact:right-auto compact:w-[calc(100%-var(--plate-col)-var(--gap)-max(var(--gutter),var(--safe-r)))] compact:bg-transparent compact:shadow-none compact:before:content-['']",
)

// Over the photo the links take full ink and a halo that holds them on a pale sky.
const ON_PHOTO = 'field-or-compact:text-ink field-or-compact:halo-mast'

interface MastheadProps {
  /** 'instrument' overlays the photo in Field and Compact and is a bar elsewhere; 'page' is always a bar. */
  variant: 'instrument' | 'page'
  /** Bird to keep selected when following the wordmark home, and to open the credits at. */
  bird?: string
}

export function Masthead({ variant, bird }: MastheadProps) {
  const [about, setAbout] = useState<'unopened' | 'open' | 'closed'>('unopened')
  const instrument = variant === 'instrument'
  // Button's `relative` lifts the links over the header's scrim, a positioned ::before in Field
  // and Compact.
  const navLink = cn('nav-link', instrument && ON_PHOTO)
  return (
    <>
      <header
        className={cn(
          'masthead z-(--z-sticky-nav) pt-(--safe-t)',
          instrument
            ? INSTRUMENT
            : 'masthead--page sticky top-0 bg-ground shadow-[inset_0_-1px_0_var(--line)]',
        )}
      >
        <div
          className={cn(
            'masthead__inner mx-auto flex h-(--masthead-h) max-w-[1840px] items-center gap-4 ps-[max(var(--gutter),var(--safe-l))] pe-[max(var(--gutter),var(--safe-r))]',
            instrument && 'field:h-12 compact:ps-[calc(max(var(--gutter),var(--safe-l))+16px)]',
          )}
        >
          {/* On pages the wordmark and the nav never shrink: the now-playing pill gives way first,
              then drops its name on phones, so About and Credits stay on screen. */}
          <Wordmark
            bird={bird}
            className={instrument ? 'field-or-compact:halo-mast' : 'flex-none'}
          />
          {!instrument && <NowPlaying />}
          <nav
            className={cn(
              'masthead__nav ms-auto -me-3 flex items-center gap-1',
              !instrument && 'flex-none [.now-playing+&]:ms-3',
            )}
            aria-label="Site"
          >
            <Button variant="nav" size="nav" className={navLink} onClick={() => setAbout('open')}>
              {COPY.navAbout}
            </Button>
            <Button asChild variant="nav" size="nav" className={navLink}>
              <Link
                to="/credits"
                search={bird ? { bird } : {}}
                hash={bird}
                activeProps={{ 'aria-current': 'page' }}
              >
                {COPY.navCredits}
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      {/* Stay mounted after the first open so the sheet can animate out. */}
      {about !== 'unopened' && (
        <Suspense fallback={null}>
          <AboutDialog open={about === 'open'} onClose={() => setAbout('closed')} bird={bird} />
        </Suspense>
      )}
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
    <Button
      variant="pill"
      size="bare"
      className="now-playing ms-auto min-h-10 max-w-[40vw] min-w-0 flex-[0_1_auto] gap-2.5 py-1 ps-1 pe-3 narrow:flex-none narrow:p-1"
      aria-label={playing ? nowPlayingAria(bird.commonName) : `Play ${bird.commonName}`}
      onClick={() => (playing ? api.pause() : api.play())}
    >
      <span
        className={cn(
          'now-playing__icon grid size-[30px] flex-none place-items-center rounded-full',
          PART,
        )}
      >
        <IconSwap
          names={['play', 'pause']}
          active={playing ? 'pause' : 'play'}
          className="size-3.5"
        />
      </span>
      <span className="now-playing__name truncate narrow:hidden">{bird.commonName}</span>
    </Button>
  )
}
