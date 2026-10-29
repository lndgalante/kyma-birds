// Display formatting. Units are joined with a no-break space and ranges with an en dash (ui.md §7.2).

export const NBSP = ' '
const EN_DASH = '–'

/** 1840 → "1.84 kHz", 860 → "860 Hz". */
export function formatHz(hz: number, kDigits = 2): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—'
  if (hz < 1000) return `${Math.round(hz)}${NBSP}Hz`
  return `${(hz / 1000).toFixed(kDigits)}${NBSP}kHz`
}

/** Splits a frequency into its number and unit, for readouts that style them apart. */
export function splitHz(hz: number): { value: string; unit: 'Hz' | 'kHz' } {
  if (hz < 1000) return { value: String(Math.round(hz)), unit: 'Hz' }
  return { value: (hz / 1000).toFixed(2), unit: 'kHz' }
}

/** Compact frequency for facts and ticks: 2131 → "2.1 kHz", 305 → "305 Hz". */
export function formatHzShort(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)}${NBSP}Hz`
  return `${trim1(hz / 1000)}${NBSP}kHz`
}

/** p10–p90 band in one unit when both share it: "2.1–4.6 kHz", "576–698 Hz", "944 Hz–2.6 kHz". */
export function formatBand(band: { p10: number; p90: number }): string {
  const { p10: lo, p90: hi } = band
  if (lo >= 1000) return `${trim1(lo / 1000)}${EN_DASH}${trim1(hi / 1000)}${NBSP}kHz`
  if (hi < 1000) return `${Math.round(lo)}${EN_DASH}${Math.round(hi)}${NBSP}Hz`
  return `${Math.round(lo)}${NBSP}Hz${EN_DASH}${trim1(hi / 1000)}${NBSP}kHz`
}

/** Spoken band for aria labels: "2.1 to 4.6 kHz". */
export function formatBandSpoken(band: { p10: number; p90: number }): string {
  return formatBand(band).replace(EN_DASH, ' to ').replace(/ /g, ' ')
}

/** "(3,2)" → "(3, 2)"; anything unparseable is returned as is. */
export function formatMode(key: string | null | undefined): string {
  if (!key) return ''
  const m = /^\((\d+),\s*(\d+)\)$/.exec(key)
  return m ? `(${m[1]}, ${m[2]})` : key
}

/** 24.4 → "0:24". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "kyma-birds-tui-20261029-014233.png": the bird, then the local date and time, so photos sort by when. */
export function platePhotoName(slug: string, at: Date): string {
  const day = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}`
  const time = `${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`
  return `kyma-birds-${slug}-${day}-${time}.png`
}

/** Zero-based index → "03 / 12". */
export function formatIndex(i: number, total: number): string {
  return `${pad2(i + 1)} / ${pad2(total)}`
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}

function trim1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}
