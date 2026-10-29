import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ExternalLink } from '~/components/ui/external-link'
import { textLinkVariants } from '~/components/ui/text-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, sourceLabel } from '~/lib/credits'
import { localNameEntries, type Bird, type Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'
import { SHEET_HEADING, Sheet, SheetCloseButton, SheetTitle } from '../shell/Sheet'
import { LANG_TAG } from './FieldLabel'
import { SongFacts } from './SongFacts'
import { IucnScale } from './StatusChip'

const HEADING = cn('details__h', SHEET_HEADING, 'mb-2')
const PARAGRAPH = 'details__p mb-2.5 max-w-[62ch] text-lg leading-[1.55] text-ink-2'
const CREDIT_LINK = 'details__credit-link flex min-h-11 items-center'

/** Everything the overlay card leaves out (ui.md §6.2). */
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
          <header className="sheet__head mb-3.5 flex items-start justify-between gap-4">
            <div>
              <SheetTitle>{b.commonName}</SheetTitle>
              <p className="details__sci mt-1.5 text-base text-ink-2">
                <i>{b.scientificName}</i>
                <span className="details__family text-md text-ink-3"> · {b.family}</span>
              </p>
            </div>
            <SheetCloseButton />
          </header>
          <div className="details grid gap-[18px]">
            <ul className="details__names flex flex-wrap gap-x-[18px] gap-y-1 text-base">
              {localNameEntries(b).map((n) => (
                <li key={n.lang} lang={n.lang}>
                  {n.name}
                  <span className={LANG_TAG} aria-hidden="true">
                    {n.tag}
                  </span>
                </li>
              ))}
            </ul>
            <IucnScale code={b.iucnStatus.code} />

            <section aria-labelledby="details-traits">
              <h3 id="details-traits" className={HEADING}>
                {COPY.detailsTraits}
              </h3>
              <ul className="details__traits">
                {b.traits.map((t) => (
                  <li key={t} className="text-base leading-[1.45] text-ink">
                    {t}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="details-song">
              <h3 id="details-song" className={HEADING}>
                {COPY.detailsSong}
              </h3>
              <p className={PARAGRAPH}>{b.songDescription}</p>
              <SongFacts
                character={b.songCharacter}
                band={b.audio.bandHz}
                peakHz={b.audio.peakHz}
                durationSec={b.audio.durationSec}
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

            <section aria-labelledby="details-credits">
              <h3 id="details-credits" className={HEADING}>
                {COPY.detailsCredits}
              </h3>
              <ul className="details__credits grid border-t border-line">
                <CreditRow label={COPY.creditsPhoto} credit={b.credits.photo} />
                <CreditRow label={COPY.creditsSong} credit={b.credits.audio} />
              </ul>
              <Link
                to="/credits"
                search={{ bird: b.slug }}
                hash={b.slug}
                className={cn('details__all text-link mt-3', textLinkVariants({ layout: 'flex' }))}
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
    <li className="details__credit grid grid-cols-[6ch_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-1.5 font-mono text-xs leading-[1.5] text-ink-2">
      <span className="details__credit-label row-span-3 self-start pt-3 text-2xs tracking-label text-ink-3 uppercase">
        {label}
      </span>
      <span className="details__credit-author pt-2.5 text-ink">{shortAuthor(credit.author)}</span>
      <ExternalLink href={credit.licenseUrl} className={CREDIT_LINK}>
        {credit.license}
      </ExternalLink>
      <ExternalLink href={credit.source} className={CREDIT_LINK} arrow>
        {sourceLabel(credit.source)}
      </ExternalLink>
    </li>
  )
}
