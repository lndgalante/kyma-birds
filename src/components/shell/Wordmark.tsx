import { Link } from '@tanstack/react-router'
import { COPY } from '~/lib/copy'
import { ChladniGlyph } from './Icon'

/** Below 380px the CSS drops "Birds", leaving the glyph and "Kyma". */
export function Wordmark({ bird }: { bird?: string }) {
  return (
    <Link
      to="/"
      search={bird ? { bird } : {}}
      className="wordmark"
      aria-label={COPY.navHomeAria}
      activeOptions={{ includeSearch: false }}
    >
      <ChladniGlyph />
      <span className="wordmark__text" aria-hidden="true">
        Kyma<span className="wordmark__rest"> Birds</span>
      </span>
    </Link>
  )
}
