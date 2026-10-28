/// <reference types="vite/client" />
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url'
import { HeadContent, Scripts, ScriptOnce, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AudioProvider } from '~/audio/AudioProvider'
import { NotFound } from '~/components/NotFound'
import { SrStatusProvider } from '~/components/shell/SrStatus'
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
      { name: 'theme-color', content: '#0f1610' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // In dev the stylesheet resolves the font through a different path, so a preload would
      // only fetch it twice; in the build both point at the same hashed file.
      ...(import.meta.env.PROD
        ? [
            {
              rel: 'preload',
              href: archivoLatin,
              as: 'font',
              type: 'font/woff2',
              crossOrigin: 'anonymous' as const,
            },
          ]
        : []),
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The inline script below adds `js` to <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ScriptOnce>{`document.documentElement.classList.add('js')`}</ScriptOnce>
        <AudioProvider>
          <SrStatusProvider>{children}</SrStatusProvider>
        </AudioProvider>
        <Scripts />
      </body>
    </html>
  )
}
