// Boss movement: parametric curves, stretched to fill the arena.
import { TAU } from '../core/math.js'
import { CURVES, curvePoint } from './curves.js'

const f = (v, d = 2) => +v.toFixed(d)
/* ------------------------------------------------------------------ */
/* Boss movement: parametric curves, stretched to fill the arena        */
/* ------------------------------------------------------------------ */
const pickOf = (r, arr) => arr[Math.floor(r() * arr.length)]

export const PATHS = {
  lissajous: {
    name: 'Lissajous',
    make: (r) => {
      const [a, b] = pickOf(r, [[1, 2], [2, 3], [3, 2], [3, 4], [1, 3], [2, 1]])
      return { a, b, d: r() * TAU }
    },
    at: (p, t) => [Math.sin(p.a * t + p.d), Math.sin(p.b * t)],
    tex: (p) => `x = sin(${p.a}t + δ)   y = sin(${p.b}t)`,
  },
  rose: {
    name: 'Rose curve',
    make: (r) => ({ k: pickOf(r, [2, 3, 4, 5, 1.5, 2.5]) }),
    at: (p, t) => {
      const r = Math.cos(p.k * t)
      return [r * Math.cos(t), r * Math.sin(t)]
    },
    tex: (p) => `r = cos(${p.k}θ)`,
  },
  lemniscate: {
    name: 'Lemniscate of Bernoulli',
    make: () => ({}),
    at: (p, t) => {
      const s = Math.sin(t)
      const d = 1 + s * s
      return [(s * Math.cos(t)) / d, Math.cos(t) / d]
    },
    tex: () => 'x = sin t·cos t / (1+sin²t)   y = cos t / (1+sin²t)',
  },
  spirograph: {
    name: 'Hypotrochoid',
    make: (r) => ({ k: pickOf(r, [3, 4, 5, 3.5, 2.5]), dd: 0.6 + r() * 0.6 }),
    at: (p, t) => {
      const q = p.k - 1
      return [q * Math.cos(t) + p.dd * Math.cos(q * t), q * Math.sin(t) - p.dd * Math.sin(q * t)]
    },
    tex: (p) => `x = (R−r)cos t + d·cos((R−r)t/r)   R/r = ${f(p.k, 1)}`,
  },
  limacon: {
    name: 'Limaçon',
    make: (r) => ({ b: 0.35 + r() * 0.4 }),
    at: (p, t) => {
      const r = p.b + Math.cos(t)
      return [r * Math.cos(t), r * Math.sin(t)]
    },
    tex: (p) => `r = ${f(p.b)} + cos θ`,
  },
}

// closed curves of the shared library as boss movement (the boss traces them)
for (const key of ['limacon', 'epicycloid', 'hypocycloid', 'koch']) {
  const C = CURVES[key]
  PATHS[key] = {
    name: C.name,
    make: (r) => ({ cp: C.make(r) }),
    at: (p, t) => curvePoint(key, p.cp, t / TAU, [0, 0]).slice(),
    tex: (p) => C.tex(p.cp),
  }
}

// Where the boss may wander (the whole arena, keeping its body on screen).
export const PATH_BOX = { cx: 270, cy: 478, ax: 210, ay: 372 }
const PATH_MAX_SPEED = 95 // px/s, so the boss glides rather than darts

// Normalise a curve to [-1,1]² numerically and pick a time scale from its
// peak speed, so every path is equally majestic.
export function buildPath(kind, p, ph, ax = PATH_BOX.ax, ay = PATH_BOX.ay, maxSpeed = PATH_MAX_SPEED, wmax = 0.6) {
  const P = PATHS[kind]
  const N = 1440
  const span = 12 * Math.PI
  let umin = Infinity
  let umax = -Infinity
  let vmin = Infinity
  let vmax = -Infinity
  const pts = []
  for (let i = 0; i <= N; i++) {
    const [u, v] = P.at(p, (i * span) / N)
    pts.push([u, v])
    if (u < umin) umin = u
    if (u > umax) umax = u
    if (v < vmin) vmin = v
    if (v > vmax) vmax = v
  }
  const cu = (umax + umin) / 2
  const cv = (vmax + vmin) / 2
  const hu = Math.max((umax - umin) / 2, 1e-3)
  const hv = Math.max((vmax - vmin) / 2, 1e-3)
  let peak = 0
  for (let i = 1; i <= N; i++) {
    const dx = (ax * (pts[i][0] - pts[i - 1][0])) / hu
    const dy = (ay * (pts[i][1] - pts[i - 1][1])) / hv
    peak = Math.max(peak, Math.hypot(dx, dy) / (span / N))
  }
  const w = Math.min(wmax, Math.max(0.12, maxSpeed / peak))
  return { kind, p, cu, cv, hu, hv, w, ph, peak: peak * w }
}

export function evalPath(path, t) {
  const [u, v] = PATHS[path.kind].at(path.p, t * path.w + path.ph)
  return [(u - path.cu) / path.hu, (v - path.cv) / path.hv]
}
