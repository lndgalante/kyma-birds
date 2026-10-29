import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { COPY } from '~/lib/copy'
import { committedIndexOf, type Bird } from '~/lib/manifest'
import { birdTheme } from '~/lib/theme'
import { cn } from '~/lib/utils'
import { AppShell } from '../shell/AppShell'
import { Masthead } from '../shell/Masthead'
import { SkipLink } from '../shell/SkipLink'
import { PAGE, PAGE_BACK_LINK, PAGE_TITLE } from '../shell/page'
import { CreditEntry } from './CreditEntry'

export function CreditsPage({ birds, highlight }: { birds: readonly Bird[]; highlight?: string }) {
  const themeBird = birds[committedIndexOf(birds, highlight)]
  // The thumbnail to load first: the entry the page opens at, else the first.
  const lead = Math.max(
    birds.findIndex((b) => b.slug === highlight),
    0,
  )

  // After the router's own scroll handling for the navigation has run.
  useEffect(() => {
    if (!highlight) return
    const id = requestAnimationFrame(() =>
      document.getElementById(highlight)?.scrollIntoView({ block: 'start' }),
    )
    return () => cancelAnimationFrame(id)
  }, [highlight])

  return (
    <AppShell className="app--page" theme={birdTheme(themeBird)}>
      <SkipLink href="#main">Skip to the credits</SkipLink>
      <Masthead variant="page" bird={highlight} />
      {/* Wider than PAGE: each entry sets its two works side by side. */}
      <main id="main" className={cn('page credits', PAGE, 'max-w-[1080px]')} tabIndex={-1}>
        <header className="page__head mb-10">
          <h1 className={PAGE_TITLE}>{COPY.creditsTitle}</h1>
          <p className="page__lede mt-4 max-w-[58ch] text-lg leading-[1.55] text-ink-2">
            {COPY.creditsIntro}
          </p>
        </header>
        <ol className="credit-list border-t border-line">
          {birds.map((b, i) => (
            <CreditEntry
              key={b.slug}
              bird={b}
              highlighted={b.slug === highlight}
              priority={i === lead}
            />
          ))}
        </ol>
        <section
          className="credits__meta mt-10 grid max-w-[72ch] gap-2 text-sm leading-[1.55] text-ink-3"
          aria-label="Typefaces and software"
        >
          <p>{COPY.creditsFonts}</p>
          <p>{COPY.creditsSoftware}</p>
        </section>
        <p className="page__back mt-10">
          <Link to="/" search={highlight ? { bird: highlight } : {}} className={PAGE_BACK_LINK}>
            {COPY.creditsBack}
          </Link>
        </p>
      </main>
    </AppShell>
  )
}
