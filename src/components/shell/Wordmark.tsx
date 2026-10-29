import { Link } from '@tanstack/react-router'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { ChladniGlyph } from './Icon'

/** Below 380px (`tiny`) it drops "Birds", leaving the glyph and "Kyma". */
export function Wordmark({ bird, className }: { bird?: string; className?: string }) {
  return (
    <Link
      to="/"
      search={bird ? { bird } : {}}
      className={cn(
        'wordmark relative -ms-0.5 inline-flex min-h-10 items-center gap-2.5 rounded-part ps-0.5 pe-1.5 font-display-medium text-lg leading-none tracking-title whitespace-nowrap text-ink no-underline pointer-coarse:min-h-11 [&>svg]:shrink-0',
        className,
      )}
      aria-label={COPY.navHomeAria}
      activeOptions={{ includeSearch: false }}
    >
      <ChladniGlyph size={18} />
      <span className="wordmark__text" aria-hidden="true">
        Kyma<span className="wordmark__rest tiny:hidden"> Birds</span>
      </span>
    </Link>
  )
}
