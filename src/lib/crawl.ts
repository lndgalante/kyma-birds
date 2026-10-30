import { birdPath, getBirds } from './manifest'
import { absoluteUrl } from './site'

const pages = [...new Set(['/', '/credits', ...getBirds().map((b) => birdPath(b.slug))])]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((path) => `  <url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`).join('\n')}
</urlset>
`
const robots = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl('/sitemap.xml')}
`

/** Serve crawl files without rendering the React application. */
export function crawlResponse(request: Request): Response | undefined {
  const path = new URL(request.url).pathname
  if (path !== '/robots.txt' && path !== '/sitemap.xml') return
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  return new Response(
    request.method === 'HEAD' ? null : path === '/robots.txt' ? robots : sitemap,
    {
      headers: {
        'Content-Type':
          path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  )
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!
  })
}
