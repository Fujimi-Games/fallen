export const TAU = Math.PI * 2
export const GOLDEN = Math.PI * (3 - Math.sqrt(5)) // 137.508°
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Signed shortest angle from a to b.
export function angDiff(a, b) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
