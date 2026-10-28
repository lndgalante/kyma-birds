import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { COPY } from '~/lib/copy'
import { shortAuthor, sourceLabel } from '~/lib/credits'
import { localNameEntries, type Bird, type Credit } from '~/lib/manifest'
import { Icon } from '../shell/Icon'
import { Sheet } from '../shell/Sheet'
import { ExternalLink } from './CreditLine'
import { SongFacts } from './SongFacts'
import { IucnScale } from './StatusChip'

/** Everything the overlay card leaves out (ui.md §6.2). */
export function BirdDetails({ bird, onClose }: { bird: Bird | null; onClose(): void }) {
  // Keep the last bird while the sheet animates out.
  const [shown, setShown] = useState(bird)
  useEffect(() => {
    if (bird) setShown(bird)
  }, [bird])
  const b = bird ?? shown
  return (
    <Sheet open={bird != null} onClose={onClose} labelledBy="details-title" variant="sheet">
      {b && (
        <>
          <header className="sheet__head">
            <div>
              <h2 id="details-title" className="sheet__title">
                {b.commonName}
              </h2>
              <p className="details__sci">
                <i>{b.scientificName}</i>
                <span className="details__family"> · {b.family}</span>
              </p>
            </div>
            <form method="dialog">
              <button type="submit" className="icon-btn icon-btn--md" aria-label={COPY.close}>
                <Icon name="close" />
              </button>
            </form>
          </header>
          <div className="details">
            <ul className="details__names">
              {localNameEntries(b).map((n) => (
                <li key={n.lang} lang={n.lang}>
                  {n.name}
                  <span className="lang-tag" aria-hidden="true">
                    {n.tag}
                  </span>
                </li>
              ))}
            </ul>
            <IucnScale code={b.iucnStatus.code} />

            <section aria-labelledby="details-traits">
              <h3 id="details-traits" className="details__h">
                {COPY.detailsTraits}
              </h3>
              <ul className="details__traits">
                {b.traits.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="details-song">
              <h3 id="details-song" className="details__h">
                {COPY.detailsSong}
              </h3>
              <p className="details__p">{b.songDescription}</p>
              <SongFacts
                character={b.songCharacter}
                band={b.audio.bandHz}
                peakHz={b.audio.peakHz}
                durationSec={b.audio.durationSec}
              />
            </section>

            <section aria-labelledby="details-where">
              <h3 id="details-where" className="details__h">
                {COPY.detailsWhere}
              </h3>
              <p className="details__p">
                {b.region}. {b.habitat}.
              </p>
            </section>

            <section aria-labelledby="details-credits">
              <h3 id="details-credits" className="details__h">
                {COPY.detailsCredits}
              </h3>
              <ul className="details__credits">
                <CreditRow label={COPY.creditsPhoto} credit={b.credits.photo} />
                <CreditRow label={COPY.creditsSong} credit={b.credits.audio} />
              </ul>
              <Link
                to="/credits"
                search={{ bird: b.slug }}
                hash={b.slug}
                className="details__all text-link"
              >
                {COPY.creditsAll}
                <Icon name="arrow-right" size={14} />
              </Link>
            </section>
          </div>
        </>
      )}
    </Sheet>
  )
}

function CreditRow({ label, credit }: { label: string; credit: Credit }) {
  return (
    <li className="details__credit">
      <span className="details__credit-label">{label}</span>
      <span className="details__credit-author">{shortAuthor(credit.author)}</span>
      <ExternalLink href={credit.licenseUrl} className="details__credit-link">
        {credit.license}
      </ExternalLink>
      <ExternalLink href={credit.source} className="details__credit-link" arrow>
        {sourceLabel(credit.source)}
      </ExternalLink>
    </li>
  )
}
