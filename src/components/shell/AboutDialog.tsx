import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { Kbd } from '~/components/ui/kbd'
import { Separator } from '~/components/ui/separator'
import { textLinkVariants } from '~/components/ui/text-link'
import { MAPPING_SENTENCE } from '~/cymatics'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { ArrowKey } from './Icon'
import { SHEET_HEADING, Sheet, SheetClose, SheetCloseButton, SheetTitle } from './Sheet'

interface AboutDialogProps {
  open: boolean
  onClose(): void
  /** The selected bird, so the credits page opens at it and "Back" keeps it. */
  bird?: string
}

export function AboutDialog({ open, onClose, bird }: AboutDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} variant="dialog">
      <header className="sheet__head mb-5 flex items-start justify-between gap-4">
        <SheetTitle>{COPY.aboutTitle}</SheetTitle>
        <SheetCloseButton />
      </header>
      <div className="prose text-md leading-[1.6] text-ink-2">
        <p className="about-kyma max-w-[62ch] text-lg leading-[1.5] text-ink">
          Kyma (<span lang="grc">κῦμα</span>) is Greek for wave. It’s the root of the word{' '}
          <i>cymatics</i>.
        </p>
        <h3 className={SHEET_HEADING}>{COPY.aboutSeeingHeading}</h3>
        <p className="max-w-[62ch]">{COPY.aboutCymatics}</p>
        <h3 className={SHEET_HEADING}>{COPY.aboutHowHeading}</h3>
        <p className="max-w-[62ch]">
          The plate on this page is simulated. As each song loops, we follow its strongest frequency
          in real time. {MAPPING_SENTENCE} The sand reorganizes as the bird’s voice rises and falls.
          Mode numbers like (3, 2) count the nodal lines in the pattern.
        </p>
        <h3 className={SHEET_HEADING}>{COPY.aboutKeyboardHeading}</h3>
        {/* No line under the last row: the footer's separator closes the table of keys. */}
        <dl className="keys divide-y divide-line border-t border-line">
          {KEYS.map(([keys, action]) => (
            <div
              key={action}
              className="keys__row grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 py-2.5 field:grid-cols-[6.5rem_minmax(0,1fr)]"
            >
              <dt className="flex items-center gap-1">
                {keys.map((k, i) => {
                  const [id, glyph] = typeof k === 'string' ? [k, k] : k
                  return (
                    <span key={id} className="contents">
                      {/* Caps side by side read as a pair; the comma is for screen readers. */}
                      {i > 0 && <span className="keys__sep sr-only">, </span>}
                      <Kbd className="h-6 min-w-6 px-2">{glyph}</Kbd>
                    </span>
                  )
                })}
              </dt>
              <dd className="text-ink-2">{action}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Separator className="mt-8" />
      <footer className="sheet__foot flex items-center justify-between gap-4 pt-5 field:flex-wrap">
        <Link
          to="/credits"
          search={bird ? { bird } : {}}
          hash={bird}
          className={cn(
            'text-link inline-flex min-h-6 items-center text-sm pointer-coarse:min-h-11',
            textLinkVariants(),
          )}
          onClick={onClose}
        >
          {COPY.aboutCreditsLink}
        </Link>
        <SheetClose asChild>
          <Button className="btn">{COPY.close}</Button>
        </SheetClose>
      </footer>
    </Sheet>
  )
}

const KEYS: Array<[keys: Array<string | [string, ReactNode]>, action: string]> = [
  [['Space'], 'play or pause'],
  [
    [
      ['left', <ArrowKey side="left" />],
      ['right', <ArrowKey side="right" />],
    ],
    'previous or next bird',
  ],
  [['Home', 'End'], 'first or last bird'],
  [['M'], 'mute'],
]
