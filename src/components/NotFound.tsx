import { Link } from '@tanstack/react-router'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { AppShell } from './shell/AppShell'
import { Masthead } from './shell/Masthead'
import { PAGE, PAGE_BACK_LINK, PAGE_TITLE } from './shell/page'

export function NotFound() {
  return (
    <AppShell className="app--page">
      <Masthead variant="page" />
      <main
        id="main"
        className={cn(
          'page not-found',
          PAGE,
          'grid min-h-[calc(100dvh-var(--masthead-h))] content-center gap-2.5',
        )}
      >
        <p
          className="not-found__code text-sm font-medium tabular-nums text-ink-3"
          aria-hidden="true"
        >
          404
        </p>
        <h1 className={PAGE_TITLE}>{COPY.notFoundTitle}</h1>
        <p className="page__back mt-6">
          <Link to="/" className={PAGE_BACK_LINK}>
            {COPY.notFoundLink}
          </Link>
        </p>
      </main>
    </AppShell>
  )
}
