import type { CSSProperties } from 'react'
import { photoAlt, photoSizes, photoSrcSet, type Bird } from '~/lib/manifest'

export type PhotoPriority = 'high' | 'auto' | 'lazy'

export function BirdPhoto({ bird: b, priority }: { bird: Bird; priority: PhotoPriority }) {
  const style = {
    '--lqip': `url("${b.photo.lqip}")`,
    '--fx': b.photo.focal.x,
    '--fy': b.photo.focal.y,
    backgroundColor: b.photo.dominantColor,
  } as CSSProperties
  return (
    <figure className="photo" style={style}>
      <img
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
