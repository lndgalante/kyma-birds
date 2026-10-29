import { Fragment } from 'react'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { StatusChip } from './StatusChip'

/**
 * The bird's label: its name, then the scientific name in italic with the Red List chip after it
 * (the chip wraps under it when the two don't fit). Names keep title tracking at every size: at
 * display tracking the macrons of "Tūī" run into the T's crossbar.
 */
export function FieldLabel({ bird: b }: { bird: Bird }) {
  return (
    <div
      className={cn(
        'field-label grid min-w-0 gap-1 text-ink',
        'field-or-compact:gap-1.5 field-or-compact:halo-label',
      )}
    >
      <h3
        className={cn(
          'card-name min-w-0 text-3xl leading-[1.04] tracking-title',
          'stacked-or-split:card-name-lg:text-4xl',
          'field-or-compact:text-2xl field-or-compact:leading-[1.08]',
        )}
      >
        {words(b.commonName)}
      </h3>
      <div className="field-label__row flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="sci text-md leading-[1.4] text-ink-3 field-or-compact:text-sm field-or-compact:text-ink-2">
          <i>{b.scientificName}</i>
        </p>
        <StatusChip code={b.iucnStatus.code} label={b.iucnStatus.label} />
      </div>
    </div>
  )
}

/**
 * "White-browed Robin-Chat" as no-wrap words joined by ordinary spaces, so the name breaks only
 * between words, never at a hyphen.
 */
function words(name: string) {
  return name.split(' ').map((w, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="whitespace-nowrap">{w}</span>
    </Fragment>
  ))
}
