import { Link } from '@tanstack/react-router'
import { COPY } from '~/lib/copy'
import { Icon } from './shell/Icon'
import { Masthead } from './shell/Masthead'

export function NotFound() {
  return (
    <div className="app app--page">
      <Masthead variant="page" />
      <main id="main" className="page not-found">
        <p className="not-found__code" aria-hidden="true">
          404
        </p>
        <h1 className="page__title">{COPY.notFoundTitle}</h1>
        <p className="page__back">
          <Link to="/" className="text-link">
            <Icon name="arrow-left" size={14} />
            {COPY.notFoundLink}
          </Link>
        </p>
      </main>
    </div>
  )
}
