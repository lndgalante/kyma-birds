import { describe, expect, it } from 'vitest'
import { crawlResponse } from '~/lib/crawl'
import { birdPath, getBirds } from '~/lib/manifest'
import { SITE_ORIGIN } from '~/lib/site'

const request = (path: string, method = 'GET') =>
  new Request(`https://preview.example${path}`, { method })

describe('crawl files', () => {
  it('advertises the public sitemap without trusting the request host', async () => {
    const response = crawlResponse(request('/robots.txt'))!
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/plain')
    expect(await response.text()).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    )
  })

  it('lists each canonical page once, using every bird in the manifest', async () => {
    const response = crawlResponse(request('/sitemap.xml'))!
    expect(response.headers.get('Content-Type')).toContain('application/xml')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    const xml = await response.text()
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
    expect(urls).toHaveLength(13)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toContain(`${SITE_ORIGIN}/credits`)
    for (const bird of getBirds()) expect(urls).toContain(`${SITE_ORIGIN}${birdPath(bird.slug)}`)
    expect(xml).not.toContain('?bird=common-nightingale')
  })

  it('supports HEAD and rejects writes without intercepting other routes', async () => {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const head = crawlResponse(request(path, 'HEAD'))!
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
      expect(crawlResponse(request(path, 'POST'))?.status).toBe(405)
    }
    expect(crawlResponse(request('/credits'))).toBeUndefined()
    expect(crawlResponse(request('/missing'))).toBeUndefined()
  })
})
