import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { COPY } from '~/lib/copy'
import { committedIndexOf, type Bird } from '~/lib/manifest'
import { birdTheme } from '~/lib/theme'
import { Icon } from '../shell/Icon'
import { Masthead } from '../shell/Masthead'
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
    <div className="app app--page" style={birdTheme(themeBird)}>
      <a className="skip-link" href="#main">
        Skip to the credits
      </a>
      <Masthead variant="page" bird={highlight} />
      <main id="main" className="page credits" tabIndex={-1}>
        <header className="page__head">
          <h1 className="page__title">{COPY.creditsTitle}</h1>
          <p className="page__lede">{COPY.creditsIntro}</p>
        </header>
        <ol className="credit-list">
          {birds.map((b) => (
            <CreditEntry key={b.slug} bird={b} highlighted={b.slug === highlight} />
          ))}
        </ol>
        <section className="credits__meta" aria-label="Typefaces and software">
          <p>{COPY.creditsFonts}</p>
          <p>{COPY.creditsSoftware}</p>
        </section>
        <p className="page__back">
          <Link to="/" search={highlight ? { bird: highlight } : {}} className="text-link">
            <Icon name="arrow-left" size={14} />
            {COPY.creditsBack}
          </Link>
        </p>
      </main>
    </div>
  )
}
