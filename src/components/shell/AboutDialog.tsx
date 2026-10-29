import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { Kbd } from '~/components/ui/kbd'
import { Separator } from '~/components/ui/separator'
import { textLinkVariants } from '~/components/ui/text-link'
import { MAPPING_SENTENCE } from '~/cymatics'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { Icon } from './Icon'
import { SHEET_HEADING, Sheet, SheetClose, SheetCloseButton, SheetTitle } from './Sheet'

// Arrows are SVG: U+2190–2192 are not in the Latin subsets of either font.
const LEFT = <Icon name="arrow-left" size={12} aria-label="Left arrow" role="img" />
const RIGHT = <Icon name="arrow-right" size={12} aria-label="Right arrow" role="img" />

const KEYS: Array<[keys: Array<string | [string, ReactNode]>, action: string]> = [
  [['Space'], 'play or pause'],
  [
    [
      ['left', LEFT],
      ['right', RIGHT],
    ],
    'previous or next bird',
  ],
  [['Home', 'End'], 'first or last bird'],
  [['M'], 'mute'],
]

const HEADING = cn(SHEET_HEADING, 'mt-3')

interface AboutDialogProps {
  open: boolean
  onClose(): void
  /** The selected bird, so the credits page opens at it and "Back" keeps it. */
  bird?: string
}

export function AboutDialog({ open, onClose, bird }: AboutDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} variant="dialog">
      <header className="sheet__head mb-3.5 flex items-start justify-between gap-4">
        <SheetTitle>{COPY.aboutTitle}</SheetTitle>
        <SheetCloseButton />
      </header>
      <div className="prose grid gap-2.5 text-lg leading-[1.55] text-ink-2">
        <p className="about-kyma max-w-[62ch] text-xl text-ink">
          Kyma (<span lang="grc">κῦμα</span>) is Greek for wave. It’s the root of the word{' '}
          <i>cymatics</i>.
        </p>
        <h3 className={HEADING}>{COPY.aboutSeeingHeading}</h3>
        <p className="max-w-[62ch]">{COPY.aboutCymatics}</p>
        <h3 className={HEADING}>{COPY.aboutHowHeading}</h3>
        <p className="max-w-[62ch]">
          The plate on this page is simulated. As each song loops, we follow its strongest frequency
          in real time. {MAPPING_SENTENCE} The sand reorganizes as the bird’s voice rises and falls.
          Mode numbers like (3, 2) count the nodal lines in the pattern.
        </p>
        <h3 className={HEADING}>{COPY.aboutKeyboardHeading}</h3>
        <dl className="keys grid gap-1.5">
          {KEYS.map(([keys, action]) => (
            <div
              key={action}
              className="keys__row grid grid-cols-[9.5rem_1fr] items-center gap-3 text-base field:grid-cols-[7.5rem_1fr]"
            >
              <dt className="flex items-center gap-0.5">
                {keys.map((k, i) => {
                  const [id, glyph] = typeof k === 'string' ? [k, k] : k
                  return (
                    <span key={id}>
                      {i > 0 && <span className="keys__sep text-ink-4">, </span>}
                      <Kbd>{glyph}</Kbd>
                    </span>
                  )
                })}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Separator className="mt-[22px]" />
      <footer className="sheet__foot flex items-center justify-between gap-4 pt-4 field:flex-wrap">
        <Link
          to="/credits"
          search={bird ? { bird } : {}}
          hash={bird}
          className={cn('text-link', textLinkVariants({ layout: 'flex' }))}
          onClick={onClose}
        >
          {COPY.aboutCreditsLink}
          <Icon name="arrow-right" size={14} />
        </Link>
        <SheetClose asChild>
          <Button className="btn">{COPY.close}</Button>
        </SheetClose>
      </footer>
    </Sheet>
  )
}
