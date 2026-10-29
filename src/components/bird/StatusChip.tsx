import { Badge } from '~/components/ui/badge'
import { COPY } from '~/lib/copy'
import type { IucnCode } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/**
 * Each code's colour as `--status`, for the chip and the scale's steps. Whole class names, as
 * Tailwind only finds classes written out in full.
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

export function StatusChip({
  code,
  label,
  size = 'md',
  className,
}: {
  code: IucnCode
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Badge
      asChild
      variant="iucn"
      className={cn('status', `status--${size}`, STATUS[code], className)}
      data-code={code}
    >
      <p>
        <span className="sr-only">{COPY.statusPrefix} </span>
        <span
          className="status__code grid min-w-7 place-items-center bg-(--status) px-1.5 font-mono text-2xs leading-none font-semibold tracking-chip text-on-status"
          aria-hidden="true"
        >
          {code}
        </span>
        <span className="status__label self-center px-2 font-sans text-sm leading-none font-medium text-ink">
          {label}
        </span>
      </p>
    </Badge>
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
    <figure className="iucn-scale m-0">
      <ol
        className="iucn-scale__steps grid max-w-[360px] grid-cols-[repeat(7,1fr)] gap-[3px]"
        aria-hidden="true"
      >
        {SCALE.map((s) => (
          <Badge
            key={s.code}
            asChild
            variant="iucn-step"
            className={STATUS[s.code]}
            data-current={s.code === code || undefined}
          >
            <li data-code={s.code}>{s.code}</li>
          </Badge>
        ))}
      </ol>
      <figcaption className="iucn-scale__caption mt-2 text-md text-ink">
        <span className="sr-only">{COPY.statusPrefix} </span>
        {current ? current.label : code}
        <span className="iucn-scale__of text-ink-3">
          {' '}
          · IUCN Red List{current ? `, step ${SCALE.indexOf(current) + 1} of ${SCALE.length}` : ''}
        </span>
      </figcaption>
    </figure>
  )
}
