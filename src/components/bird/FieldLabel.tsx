import { labelSideOf, localNameEntries, type Bird, type LabelSide } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { StatusChip } from './StatusChip'

const SIDE: Record<LabelSide, string> = {
  start: 'justify-self-start text-start',
  end: 'justify-self-end text-end',
}

/**
 * A local name's language tag, here and in Details. Ink-2 because --ink-3 over a photo falls below
 * AA (about 3:1) on most birds.
 */
export const LANG_TAG = 'lang-tag ms-1.5 font-mono text-2xs tracking-lang text-ink-2 halo-scrim'

/**
 * The stacked field label overlaid on the photo, one fact per line (reference 2).
 *
 * The traits and habitat sit lowest in the label, where the corner scrim has faded (a two-line
 * name pushes them past it on bright photos), so they carry `halo-scrim`: a wide, dark halo that
 * follows the text itself and keeps the local ground dark however tall the label grows. The small
 * language tags need it too.
 */
export function FieldLabel({ bird: b }: { bird: Bird }) {
  const names = localNameEntries(b)
  return (
    <div
      className={cn(
        'field-label relative z-1 col-start-1 row-start-1 max-w-[min(34ch,64cqi)] self-start px-6 pt-[22px] pb-6 text-ink halo-label',
        'field:px-4 field:pt-[calc(56px+var(--safe-t))] field:pb-4',
        'compact:px-4 compact:pt-[calc(52px+var(--safe-t))] compact:pb-4',
        SIDE[labelSideOf(b)],
      )}
    >
      <h3 className="card-name mb-2 text-[clamp(1.75rem,6.4cqi,3.5rem)] leading-[1.02] font-display font-stretch-88% tracking-display text-balance">
        {b.commonName}
      </h3>
      <p className="sci text-sm leading-[1.2] font-sci font-stretch-112% tracking-sci uppercase field-or-compact:text-xs">
        {b.scientificName}
      </p>
      {names.length > 0 && (
        <ul className="local-names mt-1 card-h-le-340:hidden">
          {names.map((n, i) => (
            <li
              key={n.lang}
              lang={n.lang}
              className={cn('text-base leading-[1.3] font-normal', localNameLimit(i))}
            >
              {n.name}
              <span className={LANG_TAG} aria-hidden="true">
                {n.tag}
              </span>
            </li>
          ))}
        </ul>
      )}
      <StatusChip code={b.iucnStatus.code} label={b.iucnStatus.label} className="my-2.5" />
      <ul className="traits halo-scrim card-h-le-400:hidden">
        {b.traits.map((t, i) => (
          <li key={t} className={cn('text-md leading-[1.32] font-book text-ink-2', traitLimit(i))}>
            {t}
          </li>
        ))}
      </ul>
      {/* The full ink: the clamp's overflow clips the halo at the box edges, and this small mono
          line sits lowest on the photo, where the scrim has faded (the Nightingale's pale sky). */}
      <p className="habitat mt-2 line-clamp-2 font-mono text-2xs leading-[1.45] text-ink halo-scrim card-h-lt-460:hidden">
        {b.region} — {b.habitat}
      </p>
    </div>
  )
}

/** Two local names on the photo, one on a short card; the full list lives in Details. */
function localNameLimit(i: number) {
  if (i >= 2) return 'hidden'
  if (i === 1) return 'card-h-lt-460:hidden'
}

/** Three traits, two on a short card, six on a captioned one. */
function traitLimit(i: number) {
  if (i >= 6) return 'hidden'
  if (i >= 3) return 'hidden card-captioned:list-item'
  if (i === 2) return 'card-h-lt-560:hidden'
}
