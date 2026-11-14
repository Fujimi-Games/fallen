// A library of beautiful planar curves: the single source for ranged spawners,
// melee wires and boss paths. Every curve gives a normalised table of points
// (largest radius 1) so any consumer can scale and sample it the same way.
//   parametric   closed-form curves (limaçon, epicycloid, hypocycloid, lemniscate,
//                logarithmic spiral)
//   fractal      L-system curves drawn by a turtle (Koch snowflake, Heighway
//                dragon, Lévy C, Sierpiński arrowhead, Hilbert)
import { TAU } from '../core/math.js'

const f = (v, d = 2) => +v.toFixed(d)
const pickOf = (r, a) => a[Math.floor(r() * a.length)]
const M = 360 // points per table

/* ------------------------------ L-system turtle ------------------------------ */
function turtle({ axiom, rules, angle, iter, draw }) {
  let s = axiom
  for (let i = 0; i < iter; i++) {
    let n = ''
    for (const c of s) n += rules[c] ?? c
    s = n
  }
  const pts = [[0, 0]]
  let x = 0
  let y = 0
  let a = 0
  for (const c of s) {
    if (draw.includes(c)) {
      x += Math.cos(a)
      y += Math.sin(a)
      pts.push([x, y])
    } else if (c === '+') a += angle
    else if (c === '-') a -= angle
  }
  return pts
}

// Resample a polyline to M points equally spaced by arc length; centre it and
// scale its largest radius to 1. Returns {pts, len}.
function resample(poly, closed, centre = true) {
  const P = closed ? [...poly, poly[0]] : poly
  const cum = [0]
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
  const total = cum[cum.length - 1]
  const out = []
  let j = 1
  const count = M
  for (let k = 0; k < count; k++) {
    const d = (total * k) / (closed ? count : count - 1)
    while (j < P.length - 1 && cum[j] < d) j++
    const seg = cum[j] - cum[j - 1] || 1
    const u = (d - cum[j - 1]) / seg
    out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * u, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * u])
  }
  return finish(out, centre, closed)
}

// centre (optional) and normalise so the largest radius is 1; len = path length
function finish(pts, centre, closed) {
  let cx = 0
  let cy = 0
  if (centre) {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
  }
  let mx = 0
  for (const [x, y] of pts) mx = Math.max(mx, Math.hypot(x - cx, y - cy))
  const out = pts.map(([x, y]) => [(x - cx) / mx, (y - cy) / mx])
  let len = 0
  for (let i = 1; i < out.length; i++) len += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
  if (closed) len += Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1])
  return { pts: out, len }
}

// sampled finely, then resampled by arc length so chains of circles are evenly spaced
const parametric = (at, { centre = false, closed = true } = {}) => (p) => {
  const K = 1440
  const raw = []
  for (let k = 0; k < K; k++) raw.push(at(p, (TAU * k) / (closed ? K : K - 1)))
  return resample(raw, closed, centre)
}

/* ---------------------------------- the library ---------------------------------- */
export const CURVES = {
  limacon: {
    name: 'Limaçon',
    noun: 'Cardioid',
    closed: true,
    make: (r) => ({ e: pickOf(r, [0.6, 1, 1, 1.4, 1.8]) }),
    table: parametric((p, t) => {
      const r = 1 + p.e * Math.cos(t)
      return [r * Math.cos(t), r * Math.sin(t)]
    }),
    tex: (p) => `r = 1 + ${f(p.e)}·cos θ`,
    beat: () => 3,
  },
  epicycloid: {
    name: 'Epicycloid',
    noun: 'Bloom',
    closed: true,
    make: (r) => ({ k: pickOf(r, [3, 4, 5, 6, 7]) }),
    table: parametric((p, t) => [(p.k + 1) * Math.cos(t) - Math.cos((p.k + 1) * t), (p.k + 1) * Math.sin(t) - Math.sin((p.k + 1) * t)]),
    tex: (p) => `x = ${p.k + 1}cos t − cos ${p.k + 1}t   (${p.k} cusps outward)`,
    beat: (p) => p.k,
  },
  hypocycloid: {
    name: 'Hypocycloid',
    noun: 'Astroid',
    closed: true,
    make: (r) => ({ k: pickOf(r, [3, 4, 5, 6]) }),
    table: parametric((p, t) => [(p.k - 1) * Math.cos(t) + Math.cos((p.k - 1) * t), (p.k - 1) * Math.sin(t) - Math.sin((p.k - 1) * t)]),
    tex: (p) => `x = ${p.k - 1}cos t + cos ${p.k - 1}t   (${p.k} cusps)`,
    beat: (p) => p.k,
  },
  lemniscate: {
    name: 'Lemniscate',
    noun: 'Infinity',
    closed: true,
    make: () => ({}),
    table: parametric((p, t) => {
      const s = Math.sin(t)
      const d = 1 + s * s
      return [Math.cos(t) / d, (s * Math.cos(t)) / d]
    }),
    tex: () => 'x = cos t/(1+sin²t)   y = sin t·cos t/(1+sin²t)',
    beat: () => 2,
  },
  logspiral: {
    name: 'Logarithmic spiral',
    noun: 'Nautilus',
    closed: false,
    make: (r) => ({ b: 0.18 + r() * 0.1, turns: 2 + r() * 0.8 }),
    table: (p) => {
      const raw = []
      for (let k = 0; k < 1440; k++) {
        const th = (p.turns * TAU * k) / 1439
        const rr = Math.exp(p.b * th)
        raw.push([rr * Math.cos(th), rr * Math.sin(th)])
      }
      return resample(raw, false, false)
    },
    tex: (p) => `r = e^(${f(p.b)}θ)  · ${f(p.turns, 1)} turns`,
    beat: () => 3,
  },
  koch: {
    name: 'Koch snowflake',
    noun: 'Snowflake',
    fractal: true,
    closed: true,
    make: (r) => ({ iter: pickOf(r, [2, 2, 3]) }),
    table: (p) => resample(turtle({ axiom: 'F--F--F', rules: { F: 'F+F--F+F' }, angle: Math.PI / 3, iter: p.iter, draw: 'F' }).slice(0, -1), true),
    tex: (p) => `F → F+F−−F+F   ${p.iter} iterations, dim log4/log3`,
    beat: () => 6,
  },
  dragon: {
    name: 'Heighway dragon',
    noun: 'Dragon',
    fractal: true,
    closed: false,
    make: (r) => ({ iter: pickOf(r, [5, 6, 6]) }),
    table: (p) => resample(turtle({ axiom: 'FX', rules: { X: 'X+YF+', Y: '-FX-Y' }, angle: Math.PI / 2, iter: p.iter, draw: 'F' }), false),
    tex: (p) => `X → X+YF+,  Y → −FX−Y   ${p.iter} folds`,
    beat: () => 4,
  },
  levy: {
    name: 'Lévy C curve',
    noun: 'Levy',
    fractal: true,
    closed: false,
    make: (r) => ({ iter: pickOf(r, [6, 7]) }),
    table: (p) => resample(turtle({ axiom: 'F', rules: { F: '+F--F+' }, angle: Math.PI / 4, iter: p.iter, draw: 'F' }), false),
    tex: (p) => `F → +F−−F+   ${p.iter} iterations`,
    beat: () => 4,
  },
  arrowhead: {
    name: 'Sierpiński arrowhead',
    noun: 'Gasket',
    fractal: true,
    closed: false,
    make: (r) => ({ iter: pickOf(r, [4, 5]) }),
    table: (p) => resample(turtle({ axiom: 'A', rules: { A: 'B-A-B', B: 'A+B+A' }, angle: Math.PI / 3, iter: p.iter, draw: 'AB' }), false),
    tex: (p) => `A → B−A−B,  B → A+B+A   ${p.iter} iterations`,
    beat: () => 3,
  },
  hilbert: {
    name: 'Hilbert curve',
    noun: 'Labyrinth',
    fractal: true,
    closed: false,
    make: (r) => ({ iter: pickOf(r, [2, 3]) }),
    table: (p) => resample(turtle({ axiom: 'A', rules: { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' }, angle: Math.PI / 2, iter: p.iter, draw: 'F' }), false),
    tex: (p) => `space-filling, order ${p.iter}`,
    beat: () => 4,
  },
}

export const CURVE_KEYS = Object.keys(CURVES)
export const CLOSED_CURVES = CURVE_KEYS.filter((k) => CURVES[k].closed)

/* ------------------------------------- sampling ------------------------------------- */
// Tables are pure functions of (kind, params); memoised per params object.
const memo = new WeakMap()
function tableOf(key, p) {
  let m = memo.get(p)
  if (!m) memo.set(p, (m = {}))
  return m[key] || (m[key] = CURVES[key].table(p))
}

export const curveLength = (key, p) => tableOf(key, p).len

// Point on the curve at u in [0,1) (wraps), unit radius, linear between table points.
export function curvePoint(key, p, u, out = [0, 0]) {
  const { pts } = tableOf(key, p)
  const C = CURVES[key]
  const n = pts.length
  // closed curves wrap; open ones clamp (u = 1 is the end, not the start)
  const uu = C.closed ? ((u % 1) + 1) % 1 : Math.min(1, Math.max(0, u))
  let x = uu * (C.closed ? n : n - 1)
  const i = Math.min(Math.floor(x), C.closed ? n - 1 : n - 2)
  x -= i
  const a = pts[i % n]
  const b = pts[(i + 1) % n]
  out[0] = a[0] + (b[0] - a[0]) * x
  out[1] = a[1] + (b[1] - a[1]) * x
  return out
}

// N points along the curve, scaled to radius R.
export function curveSamples(key, p, N, R) {
  const C = CURVES[key]
  const out = []
  const tmp = [0, 0]
  for (let j = 0; j < N; j++) {
    curvePoint(key, p, C.closed ? j / N : j / (N - 1), tmp)
    out.push([tmp[0] * R, tmp[1] * R])
  }
  return out
}
