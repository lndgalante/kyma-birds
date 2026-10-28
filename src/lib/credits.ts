/** Human label for a source URL's host: "Wikimedia Commons", "xeno-canto XC123456", or the bare host. */
export function sourceLabel(url: string): string {
  const host = hostOf(url)
  if (!host) return 'Source'
  if (host === 'commons.wikimedia.org' || host === 'upload.wikimedia.org')
    return 'Wikimedia Commons'
  if (host.endsWith('xeno-canto.org')) {
    const xc = xcNumber(url)
    return xc ? `xeno-canto ${xc}` : 'xeno-canto'
  }
  if (host.endsWith('macaulaylibrary.org')) return 'Macaulay Library'
  if (host.endsWith('flickr.com')) return 'Flickr'
  if (host.endsWith('doc.govt.nz')) return 'DOC New Zealand'
  return host
}

/** "https://xeno-canto.org/123456" → "XC123456". */
export function xcNumber(url: string): string | null {
  if (!hostOf(url)?.endsWith('xeno-canto.org')) return null
  const m = /(?:\/|XC)(\d{3,})(?:[/?#]|$)/i.exec(url)
  return m ? `XC${m[1]}` : null
}

/** "CC BY-SA 4.0" → "CC BY-SA", "CC0 1.0" → "CC0". */
export function shortLicense(license: string): string {
  return license.replace(/\s+\d+(\.\d+)*\s*$/, '').trim()
}

/** Author without trailing copyright boilerplate, for compact one-line credits. */
export function shortAuthor(author: string): string {
  return author.split(/,\s*©/)[0].trim()
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
