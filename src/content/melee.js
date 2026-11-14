// Melee: short-range, small-area attacks built the same way as the ranged ones:
// a SHAPE family (what is dangerous) x a MOTION law (how it moves) x a
// MODULATOR (breathing) x SYMMETRY. Everything reduces to three hit-test
// primitives, which is what keeps the fairness proof simple:
//   0 circle (a blade, or one link of a "wire")   1 sector (scythe)   2 ring (shockwave)
// Wires are chains of overlapping circles tracing a curve; shapes carry `ch`
// (chain id), `cl` (closed loop) and `c` (colour index 0/1) for the renderer.
// Melee cuts bullets. Bullets do not cut bullets, and melee does not cut melee.
import { CURVES, curveLength, curveSamples } from './curves.js'
import { PATHS, buildPath, evalPath } from './paths.js'
import { TAU, GOLDEN } from '../core/math.js'
import { segDist2, sectorDist, polyDist2 } from '../sim/collide.js'

const f = (v, d = 2) => +v.toFixed(d)
const pickOf = (r, a) => a[Math.floor(r() * a.length)]
const rng = (r, a, b) => a + (b - a) * r()
export const N_RHO = 48
// curves from the shared library that also exist as spinning melee wires
export const CURVE_WIRES = ['limacon', 'epicycloid', 'hypocycloid', 'lemniscate', 'logspiral', 'koch', 'dragon', 'levy', 'arrowhead', 'hilbert']
export const WIRE_KINDS = ['rosette', 'spiral', 'ribbon', ...CURVE_WIRES]

// Superformula radius table, normalised so the maximum is 1.
export function rhoTable(m, n, n1) {
  const t = new Array(N_RHO)
  let mx = 0
  for (let i = 0; i < N_RHO; i++) {
    const x = (m * ((TAU * i) / N_RHO)) / 4
    const r = Math.pow(Math.pow(Math.abs(Math.cos(x)), n) + Math.pow(Math.abs(Math.sin(x)), n), -1 / Math.max(0.25, n1))
    t[i] = r
    if (r > mx) mx = r
  }
  return t.map((v) => v / mx)
}

export function ringRho(sh, th) {
  const q = ((((th - (sh.rot || 0)) % TAU) + TAU) % TAU / TAU) * N_RHO
  const i0 = Math.floor(q) % N_RHO
  const fr = q - Math.floor(q)
  return sh.rho[i0] * (1 - fr) + sh.rho[(i0 + 1) % N_RHO] * fr
}

// The shockwave outline, exactly as drawn: RING_N vertices of the superformula,
// cached on the shape for the tick (shapes are rebuilt every tick).
export const RING_N = 96
export function ringPoly(sh) {
  if (sh.poly) return sh.poly
  const poly = new Array(RING_N * 2)
  for (let i = 0; i < RING_N; i++) {
    const t = (TAU * i) / RING_N
    const rho = ringRho(sh, t) * sh.R
    poly[i * 2] = sh.x + Math.cos(t) * rho
    poly[i * 2 + 1] = sh.y + Math.sin(t) * rho
  }
  sh.poly = poly
  return poly
}

// Does a disc (x, y, pr) touch one shape? Exact: the shape is what is drawn, grown
// by pr. (A wire's links are tested as a chain, see shapesHit.)
export function shapeHit(sh, px, py, pr) {
  if (sh.k === 0) {
    const rr = sh.r + pr
    const dx = px - sh.x
    const dy = py - sh.y
    return dx * dx + dy * dy < rr * rr
  }
  if (sh.k === 1) return sectorDist(sh, px, py) < pr
  // ring: a pen of width `thick` along the closed outline
  const d = Math.hypot(px - sh.x, py - sh.y)
  const reach = sh.thick / 2 + pr
  if (d > sh.R + reach || d < sh.R * (sh.minRho || 0) - reach) return false
  const rr = reach * reach
  return polyDist2(ringPoly(sh), px, py) < rr
}

// Does a disc touch any of a layer's shapes? Circles that share a chain id are one
// wire: a polyline drawn with a round pen of radius r, so the hit region is the
// capsule between neighbouring links, not just the links themselves.
export function shapesHit(shapes, x, y, pr) {
  let start = -1
  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i]
    if (sh.k === 0 && sh.ch >= 0) {
      const prev = i > 0 ? shapes[i - 1] : null
      if (prev && prev.k === 0 && prev.ch === sh.ch) {
        const rr = sh.r + pr
        if (segDist2(x, y, prev.x, prev.y, sh.x, sh.y) < rr * rr) return true
      } else start = i
      const dx = x - sh.x
      const dy = y - sh.y
      const rr = sh.r + pr
      if (dx * dx + dy * dy < rr * rr) return true
      const next = shapes[i + 1]
      if (sh.cl && i > start && !(next && next.k === 0 && next.ch === sh.ch)) {
        const f = shapes[start]
        if (segDist2(x, y, sh.x, sh.y, f.x, f.y) < rr * rr) return true
      }
    } else if (shapeHit(sh, x, y, pr)) return true
  }
  return false
}

/* ---------------- shared motion law + breathing modulator ---------------- */
// rotation law: constant spin, pendulum swing, or a whip (spin whose rate
// oscillates). Tip speeds are bounded at generation time (tipMax px/s).
function moveParams(r, R, tipMax) {
  const law = pickOf(r, ['spin', 'spin', 'pendulum', 'whip'])
  const wmax = tipMax / (R * 1.2)
  const sw = rng(r, 0.7, 1.6)
  return {
    law,
    w: law === 'pendulum' ? 0 : (r() < 0.5 ? -1 : 1) * rng(r, 0.45, 1) * Math.min(wmax / 1.6, 1.3),
    A: law === 'pendulum' ? Math.min(1.4, (wmax / sw) * 0.9) : 0,
    sw,
    ba: rng(r, 0.06, 0.18),
    bw: rng(r, 0.7, 1.6),
  }
}

function frame(p, o) {
  const t = o.t
  let rot
  if (p.law === 'pendulum') rot = p.A * Math.sin(p.sw * t)
  else if (p.law === 'whip') rot = p.w * t + ((0.6 * p.w) / p.sw) * (1 - Math.cos(p.sw * t))
  else rot = p.w * t
  return { rot, sc: (o.scale || 1) * (1 + p.ba * Math.sin(p.bw * t)) }
}

const lawText = (p) =>
  p.law === 'pendulum'
    ? `swings ±${f(p.A)}·sin(${f(p.sw)}t)`
    : p.law === 'whip'
      ? `whips ω=${f(p.w)}·(1+0.6 sin ${f(p.sw)}t)`
      : `spins ω=${f(p.w)}`

// place local points into the world with symmetry copies (alternate copies
// counter-rotate when mirrored)
function place(out, pts, o, rot, sym, mirror, hit, al, ch0, closed, colorOf) {
  for (let i = 0; i < sym; i++) {
    const flip = mirror && i & 1
    const ang = (flip ? -rot : rot) + (TAU * i) / sym
    const cs = Math.cos(ang)
    const sn = Math.sin(ang)
    for (let j = 0; j < pts.length; j++) {
      const x = pts[j][0]
      const y = flip ? -pts[j][1] : pts[j][1]
      out.push({
        k: 0,
        x: o.ox + x * cs - y * sn,
        y: o.oy + x * sn + y * cs,
        r: hit,
        al,
        c: colorOf(i, j),
        ch: ch0 + i,
        cl: closed,
      })
    }
  }
}

export const MELEE = {
  // Blades riding a parametric curve.
  blades: {
    name: 'Orbiting blades',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const curve = pickOf(r, ['rose', 'lissajous', 'spirograph', 'limacon'])
      const cp = PATHS[curve].make(r)
      const R = rng(r, 70, 110)
      const n = pickOf(r, [2, 3, 4, 5])
      return {
        curve,
        cp,
        R,
        n,
        hit: 14,
        beat: n,
        orbit: buildPath(curve, cp, r() * TAU, R, R, c.tip, 1.6),
        ...moveParams(r, R, 0),
        law: 'spin',
        w: 0,
        A: 0,
      }
    },
    tex: (p) => `${PATHS[p.curve].tex(p.cp)} · ${p.n} blades · reach ${Math.round(p.R)}px`,
    shapes(p, o, out) {
      const sc = (o.scale || 1) * (1 + p.ba * Math.sin(p.bw * o.t))
      for (let j = 0; j < p.n; j++) {
        const [u, v] = evalPath(p.orbit, o.t + (j * GOLDEN) / p.orbit.w)
        out.push({ k: 0, x: o.ox + p.R * sc * u, y: o.oy + p.R * sc * v, r: p.hit, al: o.al, c: j & 1, ch: -1 })
      }
    },
  },

  // Sector scythe(s) whose heading is a damped-harmonic (harmonograph) sweep.
  sweep: {
    name: 'Harmonic scythe',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const f1 = rng(r, 0.7, 1.1)
      const ratio = pickOf(r, [1.5, 2, 2.5, 3])
      const count = pickOf(r, [1, 2, 2, 3])
      return {
        rad: rng(r, 110, 150),
        half: rng(r, 0.5, 0.7) / (count > 2 ? 1.4 : 1),
        f1,
        f2: f1 * ratio,
        A1: (0.65 * c.ang) / f1,
        A2: (0.3 * c.ang) / (f1 * ratio),
        ph1: r() * TAU,
        ph2: r() * TAU,
        spin: (r() < 0.5 ? -1 : 1) * rng(r, 0.1, 0.25) * c.ang,
        count,
        beat: count + 2,
        ba: rng(r, 0.04, 0.1),
        bw: rng(r, 0.8, 1.5),
      }
    },
    tex: (p) =>
      `θ(t) = ${f(p.A1)}·sin(${f(p.f1)}t) + ${f(p.A2)}·sin(${f(p.f2)}t) + ${f(p.spin)}t · ${p.count} arm${p.count > 1 ? 's' : ''} · reach ${Math.round(p.rad)}px`,
    shapes(p, o, out) {
      const a = o.base + p.A1 * Math.sin(p.f1 * o.t + p.ph1) + p.A2 * Math.sin(p.f2 * o.t + p.ph2) + p.spin * o.t
      const rad = p.rad * (o.scale || 1) * (1 + p.ba * Math.sin(p.bw * o.t))
      for (let i = 0; i < p.count; i++) out.push({ k: 1, x: o.ox, y: o.oy, rad, a: a + (TAU * i) / p.count, half: p.half, al: o.al, c: i & 1, ch: -1 })
    },
  },

  // Expanding superformula shockwave(s), echoing like ripples.
  pulse: {
    name: 'Shockwave',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const m = 3 + Math.floor(r() * 6)
      const n = rng(r, 0.8, 2.5)
      const n1 = rng(r, 0.5, 1.5)
      return {
        m,
        n,
        n1,
        Rmax: rng(r, 110, 160),
        thick: 14,
        period: 1.3 / c.ang,
        rings: pickOf(r, [1, 2, 2, 3]),
        rotRate: (r() < 0.5 ? -1 : 1) * rng(r, 0.2, 0.7),
        beat: m,
        rho: rhoTable(m, n, n1),
        minRho: 0.9 * Math.min(...rhoTable(m, n, n1)),
      }
    },
    tex: (p) =>
      `r = (|cos(${p.m}θ/4)|^${f(p.n, 1)} + |sin(${p.m}θ/4)|^${f(p.n, 1)})^(−1/${f(p.n1)}) · ${p.rings} ripple${p.rings > 1 ? 's' : ''} to ${Math.round(p.Rmax)}px`,
    shapes(p, o, out) {
      const Rm = p.Rmax * (o.scale || 1)
      if (o.stage === 1) {
        out.push({ k: 2, x: o.ox, y: o.oy, R: Rm * (0.18 + 0.04 * Math.sin(o.t * 14)), rho: p.rho, minRho: p.minRho, thick: p.thick, rot: p.rotRate * o.t, al: o.al, c: 0, ch: -1 })
        return
      }
      for (let i = 0; i < p.rings; i++) {
        const ph = ((o.tauOn + (i * p.period) / p.rings) % p.period) / p.period
        out.push({ k: 2, x: o.ox, y: o.oy, R: Math.max(6, Rm * ph), rho: p.rho, minRho: p.minRho, thick: p.thick, rot: p.rotRate * o.t * (i & 1 ? -1 : 1), al: o.al * (1 - 0.55 * ph), c: i & 1, ch: -1 })
      }
    },
  },

  // A spinning rose-curve wire: r = R cos(kθ).
  rosette: {
    name: 'Rose blade',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const R = rng(r, 85, 105)
      const k = pickOf(r, [2, 3, 4, 5, 6, 7])
      return { k, R, hit: 9, N: 64, beat: k, ...moveParams(r, R, c.tip) }
    },
    tex: (p) => `r = ${Math.round(p.R)}·cos(${p.k}θ) · ${lawText(p)}`,
    shapes(p, o, out) {
      const { rot, sc } = frame(p, o)
      const pts = []
      for (let j = 0; j < p.N; j++) {
        const th = (TAU * j) / p.N
        const r = p.R * sc * Math.cos(p.k * th)
        pts.push([r * Math.cos(th), r * Math.sin(th)])
      }
      place(out, pts, o, rot, 1, false, p.hit, o.al, 0, true, (i, j) => (Math.cos(p.k * ((TAU * j) / p.N)) > 0 ? 0 : 1))
    },
  },

  // Archimedean spiral arms.
  spiral: {
    name: 'Spiral arms',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const R = rng(r, 90, 105)
      const arms = pickOf(r, [1, 2, 3])
      return { arms, turns: rng(r, 1.3, 2.1), R, hit: 9, M: 38, beat: arms * 2 + 1, ...moveParams(r, R, c.tip * 0.95) }
    },
    tex: (p) => `r = ${Math.round(p.R)}·(0.22 + 0.78·θ/${f(p.turns * 360, 0)}°) · ${p.arms} arm${p.arms > 1 ? 's' : ''} · ${lawText(p)}`,
    shapes(p, o, out) {
      const { rot, sc } = frame(p, o)
      for (let a = 0; a < p.arms; a++) {
        const pts = []
        for (let j = 0; j < p.M; j++) {
          const u = j / (p.M - 1)
          const th = u * p.turns * TAU + (TAU * a) / p.arms
          const r = p.R * sc * (0.22 + 0.78 * u)
          pts.push([r * Math.cos(th), r * Math.sin(th)])
        }
        place(out, pts, o, rot, 1, false, p.hit, o.al, a, false, () => a & 1)
      }
    },
  },

  // A rotating Lissajous wire.
  ribbon: {
    name: 'Lissajous ribbon',
    make: (r, c = { tip: 210, ang: 1 }) => {
      const a = pickOf(r, [2, 3, 4, 5])
      let b = pickOf(r, [1, 2, 3, 4])
      if (b === a) b = a + 1
      const R = rng(r, 85, 105)
      return { a, b, d: r() * TAU, R, hit: 8, N: 72, sym: pickOf(r, [1, 1, 2, 3]), mirror: r() < 0.5, beat: a + b, ...moveParams(r, R, c.tip * 0.95) }
    },
    tex: (p) => `x = ${Math.round(p.R)}·sin(${p.a}τ+δ)  y = ${Math.round(p.R)}·sin(${p.b}τ)${p.sym > 1 ? ` · ×${p.sym}${p.mirror ? ' mirrored' : ''}` : ''} · ${lawText(p)}`,
    shapes(p, o, out) {
      const { rot, sc } = frame(p, o)
      const pts = []
      for (let j = 0; j < p.N; j++) {
        const tau = (TAU * j) / p.N
        pts.push([p.R * sc * Math.sin(p.a * tau + p.d), p.R * sc * Math.sin(p.b * tau)])
      }
      place(out, pts, o, rot, p.sym, p.mirror, p.hit, o.al, 0, true, (i) => i & 1)
    },
  },
}

// Any curve of the shared library as a spinning wire: a chain of overlapping hit
// circles traced along the curve (fractals included), at most ~120 links.
function wireOf(key) {
  const C = CURVES[key]
  const chainN = (p) => Math.max(24, Math.min(120, Math.ceil((curveLength(key, p.cp) * p.R * 1.15) / 13)))
  return {
    name: C.name,
    make: (r, c = { tip: 210, ang: 1 }) => {
      const R = rng(r, 85, 105)
      const cp = C.make(r)
      const sym = C.fractal ? 1 : pickOf(r, [1, 1, 2])
      return { key, cp, R, hit: C.fractal ? 9 : 8.5, sym, mirror: r() < 0.5, beat: C.beat(cp) * sym, ...moveParams(r, R, c.tip * 0.95) }
    },
    tex: (p) => `${C.tex(p.cp)} · ${Math.round(p.R)}px${p.sym > 1 ? ` · ×${p.sym}` : ''} · ${lawText(p)}`,
    shapes(p, o, out) {
      const { rot, sc } = frame(p, o)
      const pts = curveSamples(key, p.cp, chainN(p), p.R * sc)
      place(out, pts, o, rot, p.sym, p.mirror, p.hit, o.al, 0, C.closed, (i, j) => (i & 1) | ((j >> 4) & 1))
    },
  }
}
for (const k of CURVE_WIRES) MELEE[k] = wireOf(k)
