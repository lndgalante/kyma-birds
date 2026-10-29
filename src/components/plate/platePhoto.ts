import { plateCaptionLive } from '~/lib/copy'
import { platePhotoName } from '~/lib/format'
import type { Bird } from '~/lib/manifest'

/**
 * Saves a capture of the plate (PlateHandle.capture) as a PNG: the plate on the night with its
 * shadow, the bird's name and the mode under it. Phones get the share sheet, whose
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
  ctx.fillStyle = '#070b13'
  ctx.fillStyle = token('--night')
  ctx.fillRect(0, 0, out.width, out.height)

  ctx.save()
  ctx.shadowColor = 'rgba(2, 4, 9, 0.7)'
  ctx.shadowColor = `color-mix(in oklab, ${token('--shade')} 70%, transparent)`
  ctx.shadowBlur = Math.round(w * 0.06)
  ctx.shadowOffsetY = Math.round(w * 0.03)
  ctx.drawImage(plate, m, m)
  ctx.restore()

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
