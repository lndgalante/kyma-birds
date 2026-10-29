import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { COPY } from '~/lib/copy'
import { committedIndexOf, type Bird } from '~/lib/manifest'
import { birdTheme } from '~/lib/theme'
import { cn } from '~/lib/utils'
import { AppShell } from '../shell/AppShell'
import { Icon } from '../shell/Icon'
import { Masthead } from '../shell/Masthead'
import { SkipLink } from '../shell/SkipLink'
import { PAGE, PAGE_BACK_LINK, PAGE_TITLE } from '../shell/page'
import { CreditEntry } from './CreditEntry'

export function CreditsPage({ birds, highlight }: { birds: readonly Bird[]; highlight?: string }) {
  const themeBird = birds[committedIndexOf(birds, highlight)]

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
      <main id="main" className={cn('page credits', PAGE)} tabIndex={-1}>
        <header className="page__head mb-9">
          <h1 className={PAGE_TITLE}>{COPY.creditsTitle}</h1>
          <p className="page__lede mt-3 max-w-[58ch] text-lg leading-[1.55] text-ink-2">
            {COPY.creditsIntro}
          </p>
        </header>
        <ol className="credit-list border-t border-line">
          {birds.map((b) => (
            <CreditEntry key={b.slug} bird={b} highlighted={b.slug === highlight} />
          ))}
        </ol>
        <section
          className="credits__meta mt-8 grid gap-1.5 text-md leading-[1.5] text-ink-3"
          aria-label="Typefaces and software"
        >
          <p>{COPY.creditsFonts}</p>
          <p>{COPY.creditsSoftware}</p>
        </section>
        <p className="page__back mt-10 text-base">
          <Link to="/" search={highlight ? { bird: highlight } : {}} className={PAGE_BACK_LINK}>
            <Icon name="arrow-left" size={14} />
            {COPY.creditsBack}
          </Link>
        </p>
      </main>
    </AppShell>
  )
}
