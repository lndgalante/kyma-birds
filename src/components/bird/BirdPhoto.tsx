import type { CSSProperties } from 'react'
import { photoAlt, photoSizes, photoSrcSet, type Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'

export type PhotoPriority = 'high' | 'auto' | 'lazy'

/**
 * The bird's photograph over its blurred LQIP. A card on the night (Stacked, Split, and inset in
 * Compact) rounds it and rings it faintly; Field runs it edge to edge. The scrim that holds a
 * label on the photo belongs to the label (BirdCard).
 */
export function BirdPhoto({ bird: b, priority }: { bird: Bird; priority: PhotoPriority }) {
  const style = {
    '--lqip': `url("${b.photo.lqip}")`,
    '--fx': b.photo.focal.x,
    '--fy': b.photo.focal.y,
    '--lift': liftOf(b),
    backgroundColor: b.photo.dominantColor,
  } as CSSProperties
  return (
    <figure
      className={cn(
        'photo relative z-0 col-start-1 row-start-1 m-0 min-h-0 overflow-clip rounded-card field:rounded-none',
        'before:absolute before:inset-0 before:scale-[1.12] before:bg-(image:--lqip) before:bg-cover before:bg-center before:blur-[18px]',
        // The ring sits over the image, so it holds where a lifted image is clipped.
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-line-photo field:after:hidden',
      )}
      style={style}
    >
      <img
        className={cn(
          'relative size-full object-cover object-[calc(var(--fx)*100%)_calc(var(--fy)*100%)]',
          'field-or-compact:absolute field-or-compact:inset-x-0 field-or-compact:bottom-0 field-or-compact:h-[calc((1_+_var(--lift))*100%)]',
          'data-fade:transition-opacity data-fade:duration-(--dur-4) data-fade:ease-out js:data-fade:not-data-loaded:opacity-0',
        )}
        src={b.photo.srcSm}
        srcSet={photoSrcSet(b)}
        sizes={photoSizes(b)}
        width={b.photo.width}
        height={b.photo.height}
        alt={photoAlt(b)}
        loading={priority === 'lazy' ? 'lazy' : 'eager'}
        fetchPriority={priority === 'high' ? 'high' : 'auto'}
        decoding={priority === 'high' ? 'sync' : 'async'}
        // The LCP image never fades: it paints the moment it decodes, over its LQIP.
        data-fade={priority === 'high' ? undefined : ''}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) img.setAttribute('data-loaded', '')
        }}
        onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
      />
    </figure>
  )
}

/**
 * Where the label sits on the photo (Field, Compact) the bird should sit above it: its eye and the
 * middle of its box aim at 40% of the height, the middle of the band between the masthead and the
 * label. A bird lower than that lifts the image, which then reaches past the figure's top (under
 * the masthead) by `--lift` of the figure's height, at most 35%.
 */
function liftOf({ photo }: Bird): number {
  const box = photo.birdBox
  const y = box ? (photo.focal.y + (box.y0 + box.y1) / 2) / 2 : photo.focal.y
  return Math.min(MAX_LIFT, Math.max(0, (y - EYE_LINE) / (1 - y)))
}

const EYE_LINE = 0.4
const MAX_LIFT = 0.35
