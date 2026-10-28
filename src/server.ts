import handler from '@tanstack/react-start/server-entry'

/**
 * The Worker entry (wrangler.jsonc `main`): TanStack Start's own handler, plus security headers
 * on what it renders. public/_headers only reaches the static assets, never the SSR HTML.
 * No CSP yet: the page's inline scripts (the `js` class, the track position, the router's
 * dehydration) would each need a per-request nonce.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
}

export default {
  async fetch(request: Request): Promise<Response> {
    const res = await handler.fetch(request)
    // A new Response keeps the streamed body and makes the headers writable.
    const out = new Response(res.body, res)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value)
    return out
  },
}
