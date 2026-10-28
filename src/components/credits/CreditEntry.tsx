import { COPY } from '~/lib/copy'
import { sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { ExternalLink } from '../bird/CreditLine'

function Work({ label, credit }: { label: string; credit: Credit }) {
  return (
    <div className="work">
      <p className="work__label">{label}</p>
      <p className="work__author">{credit.author}</p>
      <p className="work__license">
        <ExternalLink href={credit.licenseUrl}>{credit.license}</ExternalLink>
      </p>
      <p className="work__source">
        <ExternalLink href={credit.source} arrow>
          {sourceLabel(credit.source)}
        </ExternalLink>
      </p>
      <p className="work__note">
        <span className="work__title">“{credit.title}”</span>
        {credit.catalog && <span className="work__catalog"> · {credit.catalog}</span>}
      </p>
      <p className="work__note">Changes: {credit.changes}</p>
    </div>
  )
}

export function CreditEntry({ bird: b, highlighted }: { bird: Bird; highlighted: boolean }) {
  return (
    <li>
      <article
        id={b.slug}
        className="credit-entry"
        data-highlight={highlighted || undefined}
        aria-labelledby={`credit-${b.slug}`}
      >
        <img
          className="credit-entry__thumb"
          src={b.photo.srcSm}
          width={Math.round(b.photo.width / 2)}
          height={Math.round(b.photo.height / 2)}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            objectPosition: `${b.photo.focal.x * 100}% ${b.photo.focal.y * 100}%`,
            backgroundColor: b.photo.dominantColor,
          }}
        />
        <div className="credit-entry__body">
          <h2 id={`credit-${b.slug}`} className="credit-entry__name">
            {b.commonName} <i className="credit-entry__sci">{b.scientificName}</i>
          </h2>
          <Work label={COPY.creditsPhoto} credit={b.credits.photo} />
          <Work label={COPY.creditsSong} credit={b.credits.audio} />
        </div>
      </article>
    </li>
  )
}
