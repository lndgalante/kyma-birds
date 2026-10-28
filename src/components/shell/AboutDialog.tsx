import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { MAPPING_SENTENCE } from '~/cymatics'
import { COPY } from '~/lib/copy'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

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

interface AboutDialogProps {
  open: boolean
  onClose(): void
  /** The selected bird, so the credits page opens at it and "Back" keeps it. */
  bird?: string
}

export function AboutDialog({ open, onClose, bird }: AboutDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="about-title" variant="dialog">
      <header className="sheet__head">
        <h2 id="about-title" className="sheet__title">
          {COPY.aboutTitle}
        </h2>
        <form method="dialog">
          <button type="submit" className="icon-btn icon-btn--md" aria-label={COPY.close}>
            <Icon name="close" />
          </button>
        </form>
      </header>
      <div className="prose">
        <p className="about-kyma">
          Kyma (<span lang="grc">κῦμα</span>) is Greek for wave. It’s the root of the word{' '}
          <i>cymatics</i>.
        </p>
        <h3>{COPY.aboutSeeingHeading}</h3>
        <p>{COPY.aboutCymatics}</p>
        <h3>{COPY.aboutHowHeading}</h3>
        <p>
          The plate on this page is simulated. As each song loops, we follow its strongest frequency
          in real time. {MAPPING_SENTENCE} The sand reorganizes as the bird’s voice rises and falls.
          Mode numbers like (3, 2) count the nodal lines in the pattern.
        </p>
        <h3>{COPY.aboutKeyboardHeading}</h3>
        <dl className="keys">
          {KEYS.map(([keys, action]) => (
            <div key={action} className="keys__row">
              <dt>
                {keys.map((k, i) => {
                  const [id, glyph] = typeof k === 'string' ? [k, k] : k
                  return (
                    <span key={id}>
                      {i > 0 && <span className="keys__sep">, </span>}
                      <kbd>{glyph}</kbd>
                    </span>
                  )
                })}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
      <footer className="sheet__foot">
        <Link
          to="/credits"
          search={bird ? { bird } : {}}
          hash={bird}
          className="text-link"
          onClick={onClose}
        >
          {COPY.aboutCreditsLink}
          <Icon name="arrow-right" size={14} />
        </Link>
        <form method="dialog">
          <button type="submit" className="btn">
            {COPY.close}
          </button>
        </form>
      </footer>
    </Sheet>
  )
}
