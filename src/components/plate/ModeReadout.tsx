import { useModeKey } from '~/audio/useAudio'
import { formatMode } from '~/lib/format'
import { cn } from '~/lib/utils'
import type { PlateCaption } from './usePlateCaption'

const BASE = 'font-mono leading-[1.2] whitespace-nowrap tabular-nums'
const READOUT = {
  head: cn('mode-readout mode-readout--head', BASE, 'hidden text-sm split:block'),
  foot: cn(
    'mode-readout mode-readout--foot',
    BASE,
    'me-auto text-2xs font-medium tracking-label uppercase field-or-compact:me-0 split:hidden',
  ),
}

const LABEL = 'mode-readout__label text-ink-3'
const VALUE = 'mode-readout__value text-signal'
const FOOT_VALUE = cn(VALUE, 'text-sm tracking-normal')

/**
 * Head: "Mode (3, 2)" in the signal colour, the reading the spine points at, repeated at the plate.
 * Foot (non-Split layouts, where the figure's own caption is hidden): the plate's status line.
 */
export function ModeReadout({
  placement,
  caption,
}: {
  placement: 'head' | 'foot'
  caption?: PlateCaption
}) {
  const mode = formatMode(useModeKey())
  if (placement === 'foot' && caption) {
    return (
      <p className={READOUT.foot} aria-hidden="true" data-kind={caption.kind}>
        {caption.kind === 'live' ? (
          <>
            <span className={LABEL}>Mode</span> <span className={FOOT_VALUE}>{caption.mode}</span>
          </>
        ) : caption.kind === 'held' && caption.mode ? (
          <>
            <span className={LABEL}>Held · mode</span>{' '}
            <span className={FOOT_VALUE}>{caption.mode}</span>
          </>
        ) : (
          <span className={LABEL}>{caption.text}</span>
        )}
      </p>
    )
  }
  return (
    <p className={READOUT[placement]} aria-hidden="true">
      <span className={LABEL}>Mode</span> <span className={VALUE}>{mode || '—'}</span>
    </p>
  )
}
