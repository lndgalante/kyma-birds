export const POSTER_MESSAGE =
  'plate-poster__msg relative max-w-[26ch] rounded-bed bg-plate-surface/88 px-3.5 py-2.5 text-center text-sm leading-[1.4] text-ink-2 inset-ring inset-ring-line'

/**
 * The plate before (or without) the renderer: SSR, no JS, and WebGL failure. Same box and the
 * same render extents as the renderer (engine.md §8.4), so nothing shifts when the canvas takes
 * over. The resting sand is a CSS noise tile (--plate-sand-noise in tokens.css), drawn at device
 * resolution.
 */
export function PlatePoster({ message }: { message?: string }) {
  // 1000 units per canvas; the circle's plate radius is 1 / 1.035 of the half-canvas.
  const r = 500 / 1.035
  return (
    <div className="plate-poster absolute inset-0 grid size-full place-items-center transition-opacity duration-(--dur-3) ease-out group-data-ready/figure:opacity-0">
      <span
        className="plate-poster__sand absolute inset-[2.2%] rounded-[50%] bg-(image:--plate-sand-noise) bg-size-[180px_180px] opacity-85"
        aria-hidden="true"
      />
      <svg
        className="plate-poster__svg absolute inset-0 size-full"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="poster-bolt" cx="38%" cy="34%" r="70%">
            <stop offset="0" stopColor="#fbfaf6" />
            <stop offset="0.55" stopColor="#a9a69e" />
            <stop offset="1" stopColor="#4d4b46" />
          </radialGradient>
        </defs>
        <circle
          cx="500"
          cy="500"
          r={r * 1.015}
          fill="none"
          stroke="var(--plate-rim)"
          strokeWidth={r * 0.03}
        />
        <circle cx="500" cy="500" r={r * 0.024} fill="url(#poster-bolt)" />
      </svg>
      {message && <p className={POSTER_MESSAGE}>{message}</p>}
    </div>
  )
}
