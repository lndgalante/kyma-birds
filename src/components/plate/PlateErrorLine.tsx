import type { PlateCaption } from './usePlateCaption'

/**
 * The plate's foot line, for an error only: the page doesn't name the mode, the sand shows it.
 * The figure's visually hidden caption keeps the full status, and Describe pattern speaks it.
 */
export function PlateErrorLine({ caption }: { caption: PlateCaption }) {
  if (caption.kind !== 'error') return null
  return (
    <p
      className="plate-error text-sm leading-[1.2] font-medium whitespace-nowrap text-ink-3 me-auto field-or-compact:me-0"
      aria-hidden="true"
      data-kind={caption.kind}
    >
      {caption.text}
    </p>
  )
}
