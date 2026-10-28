import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'play'
  | 'pause'
  | 'retry'
  | 'volume'
  | 'muted'
  | 'chevron-left'
  | 'chevron-right'
  | 'external'
  | 'arrow-right'
  | 'arrow-left'
  | 'close'

// Inline SVGs on a 20px grid, 1.5px stroke, currentColor (ui.md §9.1).
const PATHS: Record<IconName, ReactNode> = {
  play: <path d="M7 4.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L7.9 4.3a.6.6 0 0 0-.9.5Z" />,
  pause: (
    <>
      <rect x="5.5" y="4.5" width="3" height="11" rx=".6" />
      <rect x="11.5" y="4.5" width="3" height="11" rx=".6" />
    </>
  ),
  retry: (
    <>
      <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" fill="none" />
      <path d="M14.4 3.4v3h-3" fill="none" />
    </>
  ),
  volume: (
    <>
      <path d="M3.5 8v4h3l4 3.5v-11L6.5 8h-3Z" fill="none" />
      <path d="M13.2 7.6a3.4 3.4 0 0 1 0 4.8M15.4 5.4a6.5 6.5 0 0 1 0 9.2" fill="none" />
    </>
  ),
  muted: (
    <>
      <path d="M3.5 8v4h3l4 3.5v-11L6.5 8h-3Z" fill="none" />
      <path d="m13.5 8 4 4m0-4-4 4" fill="none" />
    </>
  ),
  'chevron-left': <path d="m12 4.5-5.5 5.5 5.5 5.5" fill="none" />,
  'chevron-right': <path d="m8 4.5 5.5 5.5L8 15.5" fill="none" />,
  external: <path d="M8 4.5h7.5V12M15.5 4.5 5 15" fill="none" />,
  'arrow-right': <path d="M3.5 10h12.5M11.5 5.5 16 10l-4.5 4.5" fill="none" />,
  'arrow-left': <path d="M16.5 10H4M8.5 5.5 4 10l4.5 4.5" fill="none" />,
  close: <path d="m5 5 10 10M15 5 5 15" fill="none" />,
}

const FILLED = new Set<IconName>(['play', 'pause'])

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = FILLED.has(name)
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden={rest['aria-label'] ? undefined : true}
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

/** The Chladni glyph: a circular plate with two nodal diameters (wordmark and favicon). */
export function ChladniGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="glyph"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="7" strokeWidth="1.25" />
      <path d="M8 3.1v9.8M3.1 8h9.8" strokeWidth="1.25" strokeDasharray="0.01 1.9" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}
