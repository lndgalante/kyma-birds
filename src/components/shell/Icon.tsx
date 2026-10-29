import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { cn } from '~/lib/utils'

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

const ICONS: Record<IconName, LucideIcon> = {
  play: Play,
  pause: Pause,
  retry: RotateCw,
  volume: Volume2,
  muted: VolumeX,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  external: ArrowUpRight,
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  close: X,
}

// Solid glyphs inside the ink discs (play button, Listen gate, now-playing).
const FILLED = new Set<IconName>(['play', 'pause'])

// Lucide's play and pause fill three quarters of their grid. These frames draw them a little over
// half the box, with the triangle's centroid on the box's centre.
const FRAMES: Partial<Record<IconName, string>> = { play: '-5.5 -4 32 32', pause: '-4 -4 32 32' }

/** Lucide icons by name. Stroke 1.8 on Lucide's 24px grid draws 1.5px at the default 20px. */
export function Icon({
  name,
  size = 20,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<LucideProps, 'size' | 'ref'>) {
  const Glyph = ICONS[name]
  const filled = FILLED.has(name)
  const frame = FRAMES[name]
  return (
    <Glyph
      // Spread, not viewBox={frame}: an undefined viewBox would erase Lucide's own.
      {...(frame && { viewBox: frame })}
      size={size}
      strokeWidth={1.8}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      aria-hidden={rest['aria-label'] ? undefined : true}
      focusable="false"
      className={cn('icon', className)}
      {...rest}
    />
  )
}

/**
 * The Chladni glyph: a circular plate with two nodal diameters (wordmark and favicon). Lucide has
 * none.
 */
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
