import type { CSSProperties } from 'react'
import { photoAlt, photoSizes, photoSrcSet, type Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'

export type PhotoPriority = 'high' | 'auto' | 'lazy'

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
        'photo relative z-0 col-start-1 row-start-1 m-0 min-h-0 overflow-clip inset-ring inset-ring-[oklch(1_0_0/0.06)]',
        'before:absolute before:inset-0 before:scale-[1.12] before:bg-(image:--lqip) before:bg-cover before:bg-center before:blur-[18px]',
        // Bottom scrim under the overlaid caption (overlay mode only).
        'after:absolute after:inset-x-0 after:bottom-0 after:h-[66%] after:scrim-photo card-captioned:after:content-none',
        // Field: the song strip overlaps the photo's foot.
        'field:[mask-image:linear-gradient(to_bottom,#000_calc(100%-96px),transparent)]',
      )}
      style={style}
    >
      <img
        className={cn(
          'relative size-full object-cover object-[calc(var(--fx)*100%)_calc(var(--fy)*100%)]',
          'data-fade:transition-opacity data-fade:duration-(--dur-4) data-fade:ease-out js:data-fade:not-data-loaded:opacity-0',
          'motion-safe:supports-[animation-timeline:view()]:photo-drift',
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
