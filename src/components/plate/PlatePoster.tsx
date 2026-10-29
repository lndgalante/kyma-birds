export const POSTER_MESSAGE =
  'plate-poster__msg relative max-w-[26ch] rounded-bed bg-ground/88 px-3.5 py-2.5 text-center text-sm leading-[1.4] text-ink-2 inset-ring inset-ring-line'

/**
 * The plate's resting sand before (or without) the renderer: SSR, no JS, and WebGL failure. The
 * surface and rim under it are the frame's (plate-disc), shared with the renderer, so only the
 * sand changes hands, and it fades out while the renderer pours its own. The sand is a CSS noise
 * tile (--plate-sand-noise in tokens.css), drawn at device resolution and dimmed to the
 * renderer's resting dust (LOOK.restAlpha, thinning toward the rim by LOOK.restFalloff).
 */
export function PlatePoster({ message }: { message?: string }) {
  // The fade lasts as long as the renderer's first pour (SIM.pourSec + grainFadeSec), on the sine
  // that pour's average follows, so the two sands cross-fade at an even brightness.
  return (
    <div className="plate-poster absolute inset-0 grid size-full place-items-center transition-opacity duration-[950ms] ease-breath group-data-ready/figure:opacity-0">
      {/* Sand stops at 0.985 of the radius, which is 1 / 1.035 of the half-canvas. */}
      <span
        className="plate-poster__sand absolute inset-[2.4%] rounded-[50%] bg-(image:--plate-sand-noise) bg-size-[180px_180px] opacity-38 [mask-image:radial-gradient(closest-side,#000,rgb(0_0_0/0.94)_50%,rgb(0_0_0/0.76))]"
        aria-hidden="true"
      />
      {message && <p className={POSTER_MESSAGE}>{message}</p>}
    </div>
  )
}
