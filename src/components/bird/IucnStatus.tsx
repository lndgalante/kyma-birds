import { Badge } from '~/components/ui/badge'
import { COPY } from '~/lib/copy'
import type { IucnCode } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/**
 * The status on the card, in plain words after the scientific name ("Endangered"), and only for
 * a threatened bird: Least concern, and a status still unknown, wait in Details with the scale.
 */
export function StatusNote({
  code,
  label,
  className,
}: {
  code: IucnCode
  label: string
  className?: string
}) {
  if (!THREATENED.has(code)) return null
  return (
    <p className={cn('status text-md leading-[1.4] text-ink-2', className)} data-code={code}>
      <span className="sr-only">{COPY.statusPrefix} </span>
      {label}
    </p>
  )
}

/** Near threatened and worse: a status worth a word on the card. */
const THREATENED = new Set<IucnCode>(['NT', 'VU', 'EN', 'CR', 'EW', 'EX'])

/**
 * The status as a position on the Red List scale (Details sheet): a meter of seven segments, the
 * current one lit in its colour, with the label and the step on two lines under it.
 */
export function IucnScale({ code }: { code: IucnCode }) {
  const current = SCALE.find((s) => s.code === code)
  return (
    <figure className="iucn-scale m-0">
      <ol
        className="iucn-scale__steps grid max-w-[360px] grid-cols-[repeat(7,minmax(0,1fr))] gap-1"
        aria-hidden="true"
      >
        {SCALE.map((s) => (
          <Badge
            key={s.code}
            asChild
            variant="iucn-step"
            // Stretch the step's own grid track, so the bar spans the segment, not its code.
            className={cn('justify-stretch', STATUS[s.code])}
            data-current={s.code === code || undefined}
          >
            <li data-code={s.code}>{s.code}</li>
          </Badge>
        ))}
      </ol>
      <figcaption className="iucn-scale__caption mt-3.5 text-md leading-[1.4] text-ink">
        <span className="sr-only">{COPY.statusPrefix} </span>
        {current ? current.label : code}
        <span className="iucn-scale__of mt-0.5 block text-sm leading-[1.5] text-ink-3">
          {/* Spoken between the two lines, which sit on separate rows for the eye. */}
          <span className="sr-only">. </span>
          IUCN Red List{current ? `, step ${SCALE.indexOf(current) + 1} of ${SCALE.length}` : ''}
        </span>
      </figcaption>
    </figure>
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

/**
 * Each code's colour as `--status`, for the scale's steps. Whole class names, as Tailwind only
 * finds classes written out in full.
 */
const STATUS: Record<IucnCode, string> = {
  LC: '[--status:var(--iucn-lc)]',
  NT: '[--status:var(--iucn-nt)]',
  VU: '[--status:var(--iucn-vu)]',
  EN: '[--status:var(--iucn-en)]',
  CR: '[--status:var(--iucn-cr)]',
  EW: '[--status:var(--iucn-ew)]',
  EX: '[--status:var(--iucn-ex)]',
  DD: '[--status:var(--iucn-dd)]',
  NE: '[--status:var(--iucn-dd)]',
}
