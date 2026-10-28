import { COPY } from '~/lib/copy'
import type { IucnCode } from '~/lib/manifest'

export function StatusChip({
  code,
  label,
  size = 'md',
}: {
  code: IucnCode
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <p className={`status status--${size}`} data-code={code}>
      <span className="sr-only">{COPY.statusPrefix} </span>
      <span className="status__code" aria-hidden="true">
        {code}
      </span>
      <span className="status__label">{label}</span>
    </p>
  )
}

const SCALE: Array<{ code: IucnCode; label: string }> = [
  { code: 'LC', label: 'Least concern' },
  { code: 'NT', label: 'Near threatened' },
  { code: 'VU', label: 'Vulnerable' },
  { code: 'EN', label: 'Endangered' },
  { code: 'CR', label: 'Critically endangered' },
  { code: 'EW', label: 'Extinct in the wild' },
  { code: 'EX', label: 'Extinct' },
]

/** The status as a position on the Red List scale (Details sheet). */
export function IucnScale({ code }: { code: IucnCode }) {
  const current = SCALE.find((s) => s.code === code)
  return (
    <figure className="iucn-scale">
      <ol className="iucn-scale__steps" aria-hidden="true">
        {SCALE.map((s) => (
          <li key={s.code} data-code={s.code} data-current={s.code === code || undefined}>
            {s.code}
          </li>
        ))}
      </ol>
      <figcaption className="iucn-scale__caption">
        <span className="sr-only">{COPY.statusPrefix} </span>
        {current ? current.label : code}
        <span className="iucn-scale__of">
          {' '}
          · IUCN Red List{current ? `, step ${SCALE.indexOf(current) + 1} of ${SCALE.length}` : ''}
        </span>
      </figcaption>
    </figure>
  )
}
