// Fields: the flow field bullets can follow and the Chladni plate.

// Smooth pseudo-flow field (sum of travelling sines) -> heading in radians.
export function flowAngle(x, y, t) {
  return (
    Math.sin(x * 0.0115 + t * 0.45) * 2.1 +
    Math.cos(y * 0.0095 - t * 0.35) * 2.1 +
    Math.sin((x + y) * 0.0055 + t * 0.2) * 1.2
  )
}

/* ------------------------------------------------------------------ */
/* Chladni plate: f(u,v) = cos(nπu)cos(mπv) − cos(mπu)cos(nπv)          */
/* ------------------------------------------------------------------ */
export function chladni(n, m, u, v) {
  return Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) - Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v)
}

export const CHLADNI_MODES = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 4],
]
