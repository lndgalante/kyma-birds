import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaSession } from '~/audio/mediaSession'
import { useAudioApi, useAudioSnapshot, useAwake } from '~/audio/useAudio'
import { BirdDetails } from '~/components/bird/BirdDetails'
import { BirdZone } from '~/components/bird/BirdZone'
import { PickerPager } from '~/components/bird/PickerPager'
import { useSnapIndex } from '~/components/bird/useSnapIndex'
import { useWheelStep } from '~/components/bird/useWheelStep'
import { GATE_BUTTON_ID } from '~/components/plate/ListenGate'
import { PlateZone } from '~/components/plate/PlateZone'
import { AppShell } from '~/components/shell/AppShell'
import { Masthead } from '~/components/shell/Masthead'
import { SkipLink } from '~/components/shell/SkipLink'
import { useAnnounce } from '~/components/shell/SrStatus'
import { SongZone } from '~/components/song/SongZone'
import { COPY, announceBird, announceError } from '~/lib/copy'
import { birdHead } from '~/lib/head'
import { useGlobalShortcuts } from '~/lib/keyboard'
import { committedIndexOf, getBirds } from '~/lib/manifest'
import { validateBirdSearch, type NavSource } from '~/lib/search'
import { SITE_H1 } from '~/lib/site'
import { birdTheme } from '~/lib/theme'
import { cn } from '~/lib/utils'

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
  const awake = useAwake()
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
    else if (action === 'mute') {
      const muted = !audio.getSnapshot().muted
      audio.setMuted(muted)
      // While a song plays the strip's status line says so; otherwise (before Listen the strip
      // is hidden) nothing on screen would.
      if (audio.getSnapshot().state !== 'playing') {
        announce(muted ? COPY.stateMuted : COPY.stateSoundOn)
      }
    }
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
  const pager = {
    index: viewIndex,
    total: birds.length,
    onPrev: () => snapCtl.goTo(viewIndex - 1, { source: 'button' }),
    onNext: () => snapCtl.goTo(viewIndex + 1, { source: 'button' }),
  }

  return (
    <AppShell theme={birdTheme(birds[viewIndex])}>
      {/* Until the first Listen, the first Tab offers it: Listen is the page's one first action
          but sits last in the tab order, after the masthead, the caption's links and the pager.
          Script moves focus itself, so no fragment lands in the address. */}
      {!awake && (
        <SkipLink
          href={`#${GATE_BUTTON_ID}`}
          className="no-js:hidden"
          onClick={(e) => {
            const listen = document.getElementById(GATE_BUTTON_ID)
            if (!listen) return
            e.preventDefault()
            listen.focus()
          }}
        >
          {COPY.skipListen}
        </SkipLink>
      )}
      <SkipLink href="#birds">{COPY.skip}</SkipLink>
      {/* The committed bird even on a bare "/", so Credits and About open the credits at it. */}
      <Masthead variant="instrument" bird={committed.slug} />
      <main
        id="main"
        className={cn(
          'instrument grid min-h-dvh grid-cols-[minmax(0,1fr)] content-start pb-[calc(12px+var(--safe-b))] *:min-w-0',
          'stacked:min-h-[calc(100dvh-var(--masthead-h))] stacked:gap-y-3 stacked:pt-4 stacked:pr-[max(var(--gutter),var(--safe-r))] stacked:pb-[calc(16px+var(--safe-b))] stacked:pl-[max(var(--gutter),var(--safe-l))]',
          'split:mx-auto split:h-[calc(100dvh-var(--masthead-h))] split:min-h-[520px] split:max-w-[1840px] split:grid-cols-[minmax(360px,720px)_var(--plate)] split:grid-rows-[minmax(0,1fr)_var(--strip-h)] split:content-stretch split:justify-center split:gap-x-(--gap) split:gap-y-(--row-gap) split:py-(--pad-y)',
          'compact:min-h-dvh compact:grid-cols-[minmax(0,1fr)_var(--plate-col)] compact:grid-rows-[auto_auto_1fr] compact:gap-x-(--gap) compact:gap-y-2.5 compact:pt-[calc(var(--safe-t)+8px)] compact:pb-[calc(var(--safe-b)+8px)]',
        )}
      >
        <h1 className="sr-only">{SITE_H1}</h1>
        <BirdZone
          birds={birds}
          committedIndex={committedIndex}
          viewIndex={viewIndex}
          trackRef={trackRef}
          snap={snapCtl}
          onDetails={setDetailsSlug}
        />
        {/* Field and Compact have no rail to hold the arrows (BirdZone), so the pager sits low,
            in thumb reach. Compact sets it at the end of the song strip's row (this box is a flex
            row there and is otherwise transparent to the grid); Field sets it at the foot of the
            screen, after the plate. Each sits in the tab order where it sits on screen. */}
        <div className="song-row contents compact:col-start-1 compact:row-start-2 compact:flex compact:min-w-0 compact:items-center compact:gap-3 compact:[&>section]:min-w-0 compact:[&>section]:flex-auto">
          <SongZone bird={committed} />
          <PickerPager {...pager} className="hidden js:compact:flex" />
        </div>
        <PlateZone bird={committed} />
        <div className="pager-row hidden justify-center pt-3 js:field:flex">
          <PickerPager {...pager} />
        </div>
      </main>
      <BirdDetails bird={detailsBird} onClose={() => setDetailsSlug(null)} />
    </AppShell>
  )
}
