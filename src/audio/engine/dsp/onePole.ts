/** Frame-rate-independent smoothing coefficient for a one-pole filter with time constant `tau`. */
export function alpha(dt: number, tau: number): number {
  if (!(tau > 0)) return 1
  return 1 - Math.exp(-dt / tau)
}

export function onePole(y: number, target: number, a: number): number {
  return y + (target - y) * a
}
