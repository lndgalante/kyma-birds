import type { CSSProperties } from 'react'
import { photoAlt, photoSizes, photoSrcSet, type Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'

export type PhotoPriority = 'high' | 'auto' | 'lazy'

/**
 * The bird's photograph over its blurred LQIP. A card on the night (Stacked, Split, and inset in
 * Compact) rounds it and rings it faintly; Field runs it edge to edge. Where the label sits on
 * the photo (Field, Compact) a bottom scrim, in the bird's own dark, holds the text.
 */
export function BirdPhoto({ bird: b, priority }: { bird: Bird; priority: PhotoPriority }) {
  const style = {
    '--lqip': `url("${b.photo.lqip}")`,
    '--fx': b.photo.focal.x,
    '--fy': b.photo.focal.y,
    backgroundColor: b.photo.dominantColor,
  } as CSSProperties
  return (
    <figure
      className={cn(
        'photo relative z-0 col-start-1 row-start-1 m-0 min-h-0 overflow-clip rounded-card field:rounded-none',
        'before:absolute before:inset-0 before:scale-[1.12] before:bg-(image:--lqip) before:bg-cover before:bg-center before:blur-[18px]',
        // The scrim under the label. Its middle stop takes the card's --scrim-a, so a pale photo
        // gets a deeper scrim.
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-[80%] field-or-compact:after:block',
        'after:bg-[linear-gradient(to_top,color-mix(in_oklch,var(--scrim)_92%,transparent),color-mix(in_oklch,var(--scrim)_calc(var(--scrim-a,0.6)*100%),transparent)_45%,color-mix(in_oklch,var(--scrim)_calc(var(--scrim-a,0.6)*50%),transparent)_72%,transparent)]',
      )}
      style={style}
    >
      <img
        className={cn(
          'relative size-full object-cover object-[calc(var(--fx)*100%)_calc(var(--fy)*100%)]',
          // The ring is drawn on the image: an inset ring on the figure would sit under it.
          'rounded-[inherit] outline outline-line-photo -outline-offset-1 field:outline-none',
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
