import { localNameEntries, type Bird } from '~/lib/manifest'
import { StatusChip } from './StatusChip'

/** The stacked field label overlaid on the photo, one fact per line (reference 2). */
export function FieldLabel({ bird: b }: { bird: Bird }) {
  const names = localNameEntries(b)
  return (
    <div className="field-label">
      <h3 className="card-name">{b.commonName}</h3>
      <p className="sci">{b.scientificName}</p>
      {names.length > 0 && (
        <ul className="local-names">
          {names.map((n) => (
            <li key={n.lang} lang={n.lang}>
              {n.name}
              <span className="lang-tag" aria-hidden="true">
                {n.tag}
              </span>
            </li>
          ))}
        </ul>
      )}
      <StatusChip code={b.iucnStatus.code} label={b.iucnStatus.label} />
      <ul className="traits">
        {b.traits.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="habitat">
        {b.region} — {b.habitat}
      </p>
    </div>
  )
}
