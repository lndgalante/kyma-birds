/// <reference types="vite/client" />
import figtreeLatin from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url'
import instrumentSansLatin from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'
import { HeadContent, Scripts, ScriptOnce, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AudioProvider } from '~/audio/AudioProvider'
import { NotFound } from '~/components/NotFound'
import { SrStatusProvider } from '~/components/shell/SrStatus'
import { TooltipProvider } from '~/components/ui/tooltip'
import { SITE_DESCRIPTION, SITE_TITLE } from '~/lib/site'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: SITE_TITLE },
      { name: 'description', content: SITE_DESCRIPTION },
      { name: 'color-scheme', content: 'dark' },
      // The night (tokens.css --night); the bird routes set their own in lib/head.ts.
      { name: 'theme-color', content: '#07080a' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // In dev the stylesheet resolves the font through a different path, so a preload would
      // only fetch it twice; in the build both point at the same hashed file.
      ...(import.meta.env.PROD
        ? [instrumentSansLatin, figtreeLatin].map((href) => ({
            rel: 'preload',
            href,
            as: 'font',
            type: 'font/woff2',
            crossOrigin: 'anonymous' as const,
          }))
        : []),
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The inline script below adds `js` to <html> before hydration. `overflow-x-clip` on html and
    // body repeats base.css.
    <html lang="en" className="overflow-x-clip" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="overflow-x-clip">
        <ScriptOnce>{`document.documentElement.classList.add('js')`}</ScriptOnce>
        <AudioProvider>
          <SrStatusProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </SrStatusProvider>
        </AudioProvider>
        <Scripts />
      </body>
    </html>
  )
}
