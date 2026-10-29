import { Fragment } from 'react'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { StatusNote } from './IucnStatus'

/**
 * The bird's label: its name, then the scientific name in italic, and on the night a threatened
 * bird's status in plain words after it (wrapping under it when the two don't fit). On the photo
 * (Field, Compact) the label is the two names alone and drops its own box, so the card's label
 * grid (BirdCard) lays them out and the Details pill can share the scientific name's row; its
 * halo, a text shadow, still reaches them by inheritance. Names keep title tracking at every size:
 * at display tracking the macrons of "Tūī" run into the T's crossbar.
 */
export function FieldLabel({ bird: b }: { bird: Bird }) {
  return (
    <div
      className={cn(
        'field-label grid min-w-0 gap-1 text-ink',
        'field-or-compact:contents field-or-compact:halo-label',
      )}
    >
      <h3
        className={cn(
          'card-name min-w-0 text-3xl leading-[1.04] tracking-title',
          'stacked-or-split:card-name-lg:text-4xl',
          // On the photo the name steps down from 2xl as the card narrows, so the longest
          // ("Chalk-browed Mockingbird", 12.3em) keeps one line inside the label's 1rem sides,
          // down to a 320px phone.
          'field-or-compact:col-span-2 field-or-compact:text-[length:min(var(--text-2xl),(100cqi_-_2rem)/12.5)] field-or-compact:leading-[1.08]',
        )}
      >
        {words(b.commonName)}
      </h3>
      <div className="field-label__row flex min-w-0 flex-wrap items-baseline gap-x-3">
        <p className="sci text-md leading-[1.4] text-ink-3 field-or-compact:text-sm field-or-compact:text-ink-2">
          <i>{b.scientificName}</i>
        </p>
        <StatusNote
          code={b.iucnStatus.code}
          label={b.iucnStatus.label}
          className="field-or-compact:hidden"
        />
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
