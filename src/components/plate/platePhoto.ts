import { LOOK } from '~/cymatics/params'
import { plateCaptionLive } from '~/lib/copy'
import { platePhotoName } from '~/lib/format'
import type { Bird } from '~/lib/manifest'

/**
 * Saves a capture of the plate's sand (PlateHandle.capture) as a PNG: the plate as the page
 * paints it (the bird's room, the shade, the stone rim and the soft contact shadow), the sand
 * over it, and the bird's name and the mode under it. Phones get the share sheet, whose
 * "Save image" puts it in the photo library; everything else downloads the file. Resolves false
 * only when the person dismisses the share sheet.
 *
 * Everything before share() runs in the click's own task, PNG encoding included: Safari only
 * opens the share sheet inside the person's gesture.
 */
export async function savePlatePhoto(
  plate: HTMLCanvasElement,
  bird: Pick<Bird, 'slug' | 'commonName'>,
  mode: string,
): Promise<boolean> {
  const photo = frame(plate, bird.commonName, mode ? plateCaptionLive(mode) : '')
  const file = new File([pngBlob(photo)], platePhotoName(bird.slug, new Date()), {
    type: 'image/png',
  })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: bird.commonName })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      // Any other refusal (no permission, the gesture expired): download instead.
    }
  }
  download(file)
  return true
}

function frame(plate: HTMLCanvasElement, name: string, caption: string): HTMLCanvasElement {
  const css = getComputedStyle(document.documentElement)
  const token = (prop: string) => css.getPropertyValue(prop).trim()
  const { width: w, height: h } = plate
  const m = Math.round(w * 0.08)
  const nameSize = Math.round(w * 0.046)
  const smallSize = Math.round(w * 0.03)
  const nameBase = m + h + Math.round(m * 0.7) + nameSize
  const captionBase = nameBase + Math.round(smallSize * 1.7)

  const out = document.createElement('canvas')
  out.width = w + 2 * m
  out.height = captionBase + m
  const ctx = out.getContext('2d')
  if (!ctx) return plate

  // Each colour is set twice: a canvas ignores a colour string it can't parse (oklch and
  // color-mix in older engines), so the first, plain value stays.
  ctx.fillStyle = '#0b0c0a'
  ctx.fillStyle = token('--night')
  // The room is the page's own background, mid-drift included.
  const app = document.querySelector('.app')
  if (app) ctx.fillStyle = getComputedStyle(app).backgroundColor
  ctx.fillRect(0, 0, out.width, out.height)

  paintDisc(ctx, m + w / 2, m + h / 2, Math.min(w, h) / 2, token)
  ctx.drawImage(plate, m, m)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ece9e1'
  ctx.fillStyle = token('--ink')
  ctx.font = `500 ${nameSize}px ${token('--font-display')}`
  ctx.fillText(name, m, nameBase)

  ctx.fillStyle = '#a3abbb'
  ctx.fillStyle = token('--ink-3')
  ctx.font = `500 ${smallSize}px ${token('--font-sans')}`
  if (caption) ctx.fillText(caption, m, captionBase)
  ctx.textAlign = 'end'
  ctx.fillText('Kyma Birds', out.width - m, nameBase)
  return out
}

/**
 * The plate's surface, rim and contact shadow as app.css plate-disc paints them on the frame
 * (`half`: the frame's radius in canvas pixels, the render extent).
 */
function paintDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  token: (prop: string) => string,
) {
  // Canvas pixels per CSS pixel, for the rim's 1.5px floor, the 1px edges and the shadow.
  const cssW = document.querySelector('.plate-frame')?.clientWidth
  const k = cssW ? (2 * half) / cssW : window.devicePixelRatio || 1
  const r = half / LOOK.extent.circle
  const rim = Math.max(r * 0.011, 1.5 * k)

  // --plate-shadow (0 10px 28px -14px, 55% black), outside the frame only, as a box-shadow is:
  // the circle is drawn off canvas and only its shadow lands.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.arc(cx, cy, half, 0, 2 * Math.PI, true)
  ctx.clip('evenodd')
  const away = ctx.canvas.width * 2
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 28 * k
  ctx.shadowOffsetX = away
  ctx.shadowOffsetY = 10 * k
  ctx.beginPath()
  ctx.arc(cx - away, cy, Math.max(0, half - 14 * k), 0, 2 * Math.PI)
  ctx.fill()
  ctx.restore()

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, half)
  const stop = (at: number, colour: string, fallback: string) => {
    const t = Math.min(1, Math.max(0, at / half))
    try {
      g.addColorStop(t, colour || fallback)
    } catch {
      g.addColorStop(t, fallback) // a colour this canvas can't parse
    }
  }
  const rimColour = token('--plate-rim')
  stop(0, token('--plate-surface'), 'rgba(0, 0, 0, 0.3)')
  stop(r - 0.5 * k, token('--plate-surface-edge'), 'rgba(0, 0, 0, 0.42)')
  stop(r + 0.5 * k, rimColour, '#716e69')
  stop(r + rim - 0.5 * k, rimColour, '#716e69')
  stop(r + rim + 0.5 * k, 'transparent', 'transparent')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, half, 0, 2 * Math.PI)
  ctx.fill()
}

/** Synchronous PNG encoding (toBlob is async and would lose the gesture). */
function pngBlob(canvas: HTMLCanvasElement): Blob {
  const bin = atob(canvas.toDataURL('image/png').split(',')[1])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers read the URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
