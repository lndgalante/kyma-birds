import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaSession } from '~/audio/mediaSession'
import { useAudioApi, useAudioSnapshot } from '~/audio/useAudio'
import { BirdDetails } from '~/components/bird/BirdDetails'
import { BirdZone } from '~/components/bird/BirdZone'
import { useSnapIndex } from '~/components/bird/useSnapIndex'
import { useWheelStep } from '~/components/bird/useWheelStep'
import { PlateZone } from '~/components/plate/PlateZone'
import { Masthead } from '~/components/shell/Masthead'
import { useAnnounce } from '~/components/shell/SrStatus'
import { SongZone } from '~/components/song/SongZone'
import { COPY, announceBird, announceError } from '~/lib/copy'
import { birdHead } from '~/lib/head'
import { useGlobalShortcuts } from '~/lib/keyboard'
import { committedIndexOf, getBirds } from '~/lib/manifest'
import { validateBirdSearch, type NavSource } from '~/lib/search'
import { SITE_H1 } from '~/lib/site'
import { birdTheme } from '~/lib/theme'

export const Route = createFileRoute('/')({
  validateSearch: validateBirdSearch,
  // The manifest is a static import (it ships in the client bundle anyway), so there is no
  // loader: dehydrating it would send the same 40 KB twice.
  head: ({ match }) => birdHead(getBirds(), match.search.bird),
  component: Instrument,
})

function Instrument() {
  const birds = getBirds()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const audio = useAudioApi()
  const snap = useAudioSnapshot()
  const announce = useAnnounce()

  const committedIndex = committedIndexOf(birds, search.bird)
  const committed = birds[committedIndex]
  const [viewIndex, setViewIndex] = useState(committedIndex)
  const [detailsSlug, setDetailsSlug] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const committedSlug = useRef(committed.slug)
  committedSlug.current = committed.slug
  const expected = useRef<string | null>(null)

  const commit = useCallback(
    (i: number, source: NavSource) => {
      const b = birds[i]
      if (!b || b.slug === committedSlug.current) return
      expected.current = b.slug
      void navigate({
        to: '/',
        search: (prev) => ({ ...prev, bird: b.slug }),
        replace: true,
        resetScroll: false,
      })
      // The focused rail tab already speaks the bird's name.
      if (source !== 'rail') {
        announce(
          announceBird(i + 1, birds.length, b.commonName, b.scientificName, b.iucnStatus.label),
        )
      }
    },
    [birds, navigate, announce],
  )

  const snapCtl = useSnapIndex(trackRef, {
    count: birds.length,
    initialIndex: committedIndex,
    onView: setViewIndex,
    onSettle: commit,
  })
  useWheelStep(trackRef, (dir) => snapCtl.goTo(snapCtl.current() + dir, { source: 'wheel' }))

  // The URL changed without the track (wordmark, media keys, a pasted link): follow it.
  useEffect(() => {
    if (expected.current === committed.slug) return
    expected.current = committed.slug
    if (snapCtl.current() !== committedIndex) snapCtl.goTo(committedIndex, { source: 'url' })
  }, [committed.slug, committedIndex, snapCtl])

  useEffect(() => {
    audio.select(committed)
  }, [audio, committed])

  // An unknown `?bird=` is already ignored; take it out of the address bar too.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search)
    if (raw.has('bird') && !search.bird) {
      void navigate({ to: '/', search: (prev) => prev, replace: true, resetScroll: false })
    }
    // Mount only: later URLs are written by the app itself.
  }, [])

  // Neighbours' bytes, once the committed song is under way (or after 1.5 s of quiet browsing).
  const playing = snap.state === 'playing'
  useEffect(() => {
    const go = () => {
      for (const d of [-1, 1]) {
        const n = birds[committedIndex + d]
        if (n) audio.prefetch(n)
      }
    }
    if (playing) {
      go()
      return
    }
    const id = window.setTimeout(go, 1500)
    return () => window.clearTimeout(id)
  }, [audio, birds, committedIndex, playing])

  const failed = snap.state === 'error' && snap.error !== 'unsupported'
  useEffect(() => {
    if (failed) announce(announceError(committed.commonName))
  }, [failed, committed.commonName, announce])

  useGlobalShortcuts((action) => {
    const i = snapCtl.current()
    if (action === 'prev') snapCtl.goTo(i - 1, { source: 'key' })
    else if (action === 'next') snapCtl.goTo(i + 1, { source: 'key' })
    else if (action === 'first') snapCtl.goTo(0, { source: 'key' })
    else if (action === 'last') snapCtl.goTo(birds.length - 1, { source: 'key' })
    else if (action === 'toggle') audio.toggle()
    else if (action === 'mute') audio.setMuted(!audio.getSnapshot().muted)
  })

  useMediaSession({
    bird: committed,
    state: snap.state,
    onPlay: audio.play,
    onPause: audio.pause,
    onPrev: () => snapCtl.goTo(committedIndex - 1, { source: 'media' }),
    onNext: () => snapCtl.goTo(committedIndex + 1, { source: 'media' }),
  })

  const detailsBird = birds.find((b) => b.slug === detailsSlug) ?? null

  return (
    <div className="app" style={birdTheme(birds[viewIndex])}>
      <a className="skip-link" href="#birds">
        {COPY.skip}
      </a>
      <Masthead variant="instrument" bird={search.bird} />
      <main id="main" className="instrument">
        <h1 className="sr-only">{SITE_H1}</h1>
        <BirdZone
          birds={birds}
          committedIndex={committedIndex}
          viewIndex={viewIndex}
          trackRef={trackRef}
          snap={snapCtl}
          onDetails={setDetailsSlug}
        />
        <SongZone bird={committed} />
        <PlateZone bird={committed} />
      </main>
      <BirdDetails bird={detailsBird} onClose={() => setDetailsSlug(null)} />
    </div>
  )
}
