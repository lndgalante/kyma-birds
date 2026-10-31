import { useEffect, useState } from 'react'
import { ExternalLink } from '~/components/ui/external-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, sourceLabel } from '~/lib/credits'
import { localNameEntries, type Bird, type Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { SHEET_HEADING, Sheet, SheetCloseButton, SheetTitle } from '../shell/Sheet'
import { FACT_LABEL, SongFacts } from './SongFacts'
import { IucnScale } from './IucnStatus'

const HEADING = cn('details__h', SHEET_HEADING)
const PARAGRAPH = 'details__p max-w-[62ch] text-md leading-[1.6] text-ink-2'
/** A list of rows on hairlines (names, traits, credits): a rule above the first, one under each. */
const ROWS = 'border-t border-line'
const ROW = 'border-b border-line py-2.5'
const CREDIT_LINK = 'details__credit-link inline-flex min-h-6 items-center pointer-coarse:min-h-11'

/**
 * Everything the card leaves out, set as a specimen sheet: the photograph as a banner, the
 * names, then the song and habitat beside the status, names and traits (one column on phones),
 * and the credits as a ledger at the foot.
 */
export function BirdDetails({ bird, onClose }: { bird: Bird | null; onClose(): void }) {
  // Keep the last bird while the sheet animates out.
  const [shown, setShown] = useState(bird)
  useEffect(() => {
    if (bird) setShown(bird)
  }, [bird])
  const b = bird ?? shown
  return (
    <Sheet open={bird != null} onClose={onClose} variant="sheet">
      {b && (
        <>
          <header className="sheet__head mb-8 grid gap-5 stacked:gap-6">
            {/* Decoration: the name is right under it. The height cap keeps the title in view
                on a landscape phone. */}
            <div className="details__banner relative overflow-hidden rounded-bed bg-ground-sunken after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-line-photo">
              <img
                className="details__photo block aspect-[16/7] max-h-[34dvh] w-full object-cover"
                src={b.photo.srcSm}
                width={Math.round(b.photo.width / 2)}
                height={Math.round(b.photo.height / 2)}
                alt=""
                decoding="async"
                style={{
                  objectPosition: `${b.photo.focal.x * 100}% ${b.photo.focal.y * 100}%`,
                  backgroundColor: b.photo.dominantColor,
                }}
              />
              <SheetCloseButton className="absolute top-2 end-2 z-1 m-0 bg-scrim/60 text-ink inset-ring inset-ring-ink/16 backdrop-blur-sm hover:bg-scrim/85" />
            </div>
            <div className="details__title">
              {/* At display tracking the macrons of "Tūī" meet the T. */}
              <SheetTitle className="tracking-title">{b.commonName}</SheetTitle>
              <p className="details__sci mt-2 text-md leading-[1.4] text-ink-2">
                <i>{b.scientificName}</i>
              </p>
              <p className="details__family text-sm leading-[1.5] text-ink-3">Family {b.family}</p>
            </div>
          </header>
          <div className="details grid gap-x-10 stacked:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="details__main">
              <section aria-labelledby="details-song">
                <h3 id="details-song" className={cn(HEADING, 'mt-0')}>
                  {COPY.detailsSong}
                </h3>
                <p className={PARAGRAPH}>{b.songDescription}</p>
                <dl className="details__character mt-5 grid gap-0.5">
                  <dt className={FACT_LABEL}>Character</dt>
                  <dd className="text-md leading-[1.5] text-ink">{sentence(b.songCharacter)}</dd>
                </dl>
                <SongFacts
                  band={b.audio.bandHz}
                  peakHz={b.audio.peakHz}
                  durationSec={b.audio.durationSec}
                  className="mt-4"
                />
              </section>

              <section aria-labelledby="details-where">
                <h3 id="details-where" className={HEADING}>
                  {COPY.detailsWhere}
                </h3>
                <p className={PARAGRAPH}>
                  {b.region}. {b.habitat}.
                </p>
              </section>
            </div>

            <div className="details__side">
              <section aria-labelledby="details-status">
                <h3 id="details-status" className={cn(HEADING, 'stacked:mt-0')}>
                  Status
                </h3>
                <IucnScale code={b.iucnStatus.code} />
              </section>

              <section aria-labelledby="details-names">
                <h3 id="details-names" className={HEADING}>
                  Other names
                </h3>
                <ul className={cn('details__names', ROWS)}>
                  {localNameEntries(b).map((n) => (
                    <li
                      key={n.lang}
                      lang={n.lang}
                      className={cn(
                        ROW,
                        'flex items-baseline justify-between gap-3 text-md leading-[1.4] text-ink',
                      )}
                    >
                      {n.name}
                      <span className="lang-tag text-xs font-medium text-ink-3" aria-hidden="true">
                        {n.tag}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="details-traits">
                <h3 id="details-traits" className={HEADING}>
                  {COPY.detailsTraits}
                </h3>
                <ul className={cn('details__traits', ROWS)}>
                  {b.traits.map((t) => (
                    <li key={t} className={cn(ROW, 'text-md leading-[1.4] text-ink-2')}>
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <section aria-labelledby="details-credits">
            <h3 id="details-credits" className={cn(HEADING, 'mt-10')}>
              {COPY.detailsCredits}
            </h3>
            <ul className={cn('details__credits', ROWS)}>
              <CreditRow label={COPY.creditsPhoto} credit={b.credits.photo} />
              <CreditRow label={COPY.creditsSong} credit={b.credits.audio} />
            </ul>
          </section>
        </>
      )}
    </Sheet>
  )
}

/**
 * One work on the ledger: label, author, licence, source in four columns from 40rem (the link
 * columns have a floor wide enough for every licence and "Wikimedia Commons", so the two rows
 * line up); on phones the links wrap onto a line of their own under the author.
 */
function CreditRow({ label, credit }: { label: string; credit: Credit }) {
  return (
    <li
      className={cn(
        'details__credit grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-4 text-sm leading-[1.5]',
        'stacked:grid-cols-[4.5rem_minmax(0,1fr)_minmax(6rem,auto)_minmax(8.5rem,auto)] stacked:gap-x-5',
        ROW,
        'py-3',
      )}
    >
      <span className="details__credit-label font-medium text-ink-3">{label}</span>
      <span className="details__credit-author min-w-0 text-md text-ink">
        {shortAuthor(credit.author)}
      </span>
      <span className="col-start-2 flex flex-wrap gap-x-4 stacked:contents">
        <ExternalLink href={credit.licenseUrl} className={CREDIT_LINK}>
          {credit.license}
        </ExternalLink>
        <ExternalLink href={credit.source} className={CREDIT_LINK}>
          {sourceLabel(credit.source)}
        </ExternalLink>
      </span>
    </li>
  )
}

/** "rich melodious fluty whistles" → "Rich melodious fluty whistles". */
function sentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
