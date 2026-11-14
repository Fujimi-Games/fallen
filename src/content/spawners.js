// Spawners: where, and in which direction, bullets appear.
import { TAU, GOLDEN } from '../core/math.js'
import { CURVES, curvePoint, curveLength } from './curves.js'
import { mulberry32 } from '../core/rng.js'

const f = (v, d = 2) => +v.toFixed(d)

// Normal of a curve at (ox,oy) with tangent (dx,dy), pointing away from origin.
function outwardNormal(ox, oy, dx, dy) {
  let nx = dy
  let ny = -dx
  if (nx * ox + ny * oy < 0) {
    nx = -nx
    ny = -ny
  }
  return Math.atan2(ny, nx)
}

/* ------------------------------------------------------------------ */
/* Spawners                                                            */
/* ------------------------------------------------------------------ */
// emit(L, st, t, m, out): push {ox, oy, a, s, link?} into out.
//   L = layer config, st = per-layer mutable state, t = boss time,
//   m = modulator output {rot, spd, rate, morph}

export const SPAWNERS = {
  phyllotaxis: {
    kind: 'stream',
    name: 'Phyllotaxis',
    noun: 'Sunflower',
    symMax: 3,
    make: (r) => ({
      rate: 38 + r() * 14,
      bias: (r() - 0.5) * 0.01,
      skew: 0.012 + r() * 0.012,
    }),
    emit(L, st, t, m, out) {
      st.ang = (st.ang || 0) + GOLDEN + L.p.bias + L.p.skew * m.morph
      out.push({ ox: 0, oy: 0, a: st.ang + m.rot, s: L.speed * m.spd })
    },
    tex: () => 'θₙ = n · 137.508°   r = v·t',
  },

  rose: {
    kind: 'burst',
    name: 'Rhodonea',
    noun: 'Rose',
    make: (r) => ({
      k: 3 + Math.floor(r() * 5),
      sharp: 1.4 + r() * 2,
      N: 60,
      rate: 0.8 + r() * 0.4,
    }),
    emit(L, st, t, m, out) {
      const { N, sharp } = L.p
      const k = Math.max(2, Math.round(L.p.k + m.morph * 2))
      st.n = (st.n || 0) + 1
      const off = st.n & 1 ? Math.PI / k : 0
      for (let j = 0; j < N; j++) {
        const th = (TAU * j) / N
        const lobe = 0.5 + 0.5 * Math.cos(k * th)
        out.push({
          ox: 0,
          oy: 0,
          a: th + off + m.rot,
          s: L.speed * (0.22 + 0.78 * Math.pow(lobe, sharp)) * m.spd,
          link: true,
        })
      }
    },
    tex: (p) => `v(θ) = ½ + ½cos(${p.k}θ)   (k drifts)`,
  },

  superformula: {
    kind: 'burst',
    name: 'Superformula',
    noun: 'Star',
    make: (r) => ({
      m: 3 + Math.floor(r() * 7),
      n1: 0.45 + r() * 1.1,
      n: 0.7 + r() * 2.3,
      N: 64,
      rate: 0.8 + r() * 0.4,
    }),
    emit(L, st, t, m, out) {
      const { N, n } = L.p
      const mm = L.p.m
      const n1 = Math.max(0.25, L.p.n1 * (1 + 0.45 * m.morph))
      const rs = new Array(N)
      let mx = 0
      for (let j = 0; j < N; j++) {
        const x = (mm * ((TAU * j) / N)) / 4
        const r = Math.pow(
          Math.pow(Math.abs(Math.cos(x)), n) + Math.pow(Math.abs(Math.sin(x)), n),
          -1 / n1,
        )
        rs[j] = r
        if (r > mx) mx = r
      }
      st.n = (st.n || 0) + 1
      const off = st.n & 1 ? Math.PI / mm : 0
      for (let j = 0; j < N; j++) {
        out.push({
          ox: 0,
          oy: 0,
          a: (TAU * j) / N + off + m.rot,
          s: L.speed * (0.3 + 0.7 * (rs[j] / mx)) * m.spd,
          link: true,
        })
      }
    },
    tex: (p) => `r = (|cos(${p.m}θ/4)|^${f(p.n, 1)} + |sin(${p.m}θ/4)|^${f(p.n, 1)})^(−1/${f(p.n1, 2)})`,
  },

  lissajous: {
    kind: 'stream',
    name: 'Lissajous',
    noun: 'Weaver',
    make: (r) => {
      const a = [2, 3, 4, 5][Math.floor(r() * 4)]
      let b = [1, 2, 3, 4][Math.floor(r() * 4)]
      if (b === a) b = a + 1
      return {
        rate: 20 + r() * 10,
        A: 70 + r() * 40,
        B: 70 + r() * 40,
        a,
        b,
        d: r() * TAU,
        w: 0.45 + r() * 0.4,
      }
    },
    emit(L, st, t, m, out) {
      const p = L.p
      const u = t * p.w
      const ox = p.A * Math.sin(p.a * u + p.d)
      const oy = p.B * Math.sin(p.b * u)
      const dx = p.A * p.a * Math.cos(p.a * u + p.d)
      const dy = p.B * p.b * Math.cos(p.b * u)
      out.push({ ox, oy, a: outwardNormal(ox, oy, dx, dy) + m.rot, s: L.speed * m.spd })
    },
    tex: (p) => `x = ${Math.round(p.A)}·sin(${p.a}t+δ)   y = ${Math.round(p.B)}·sin(${p.b}t)`,
  },

  spirograph: {
    kind: 'stream',
    name: 'Hypotrochoid',
    noun: 'Orbit',
    make: (r) => ({
      rate: 22 + r() * 10,
      k: [2.5, 3, 3.5, 4, 5, 7 / 3][Math.floor(r() * 6)],
      dd: 0.55 + r() * 0.7,
      rad: 70 + r() * 40,
      w: 0.6 + r() * 0.5,
    }),
    emit(L, st, t, m, out) {
      const { k, dd, rad, w } = L.p
      const u = t * w
      const q = k - 1
      const ext = q + dd
      const sc = rad / ext
      const ox = (q * Math.cos(u) + dd * Math.cos(q * u)) * sc
      const oy = (q * Math.sin(u) - dd * Math.sin(q * u)) * sc
      const dx = -q * Math.sin(u) - dd * q * Math.sin(q * u)
      const dy = q * Math.cos(u) - dd * q * Math.cos(q * u)
      out.push({ ox, oy, a: outwardNormal(ox, oy, dx, dy) + m.rot, s: L.speed * m.spd })
    },
    tex: (p) => `x = (R−r)cos t + d·cos((R−r)t/r)   R/r = ${f(p.k, 2)}`,
  },
}

/* ---------------------- curve-library spawners (added from CURVES) ---------------------- */
// A curve spawner walks a point round the curve and fires outward from it (stream),
// or fires from every point of a closed curve at once (burst: the curve expands).
const tmp = [0, 0]
const tmp2 = [0, 0]
// open curves are walked back and forth (triangle wave); closed ones loop
const along = (C, u) => (C.closed ? u : 1 - Math.abs((u % 2) - 1))
function walker(key, noun, rateBase) {
  const C = CURVES[key]
  return {
    kind: 'stream',
    name: C.name,
    noun,
    better: ['rad'],
    make: (r) => ({ rate: rateBase + r() * 10, rad: 60 + r() * 40, w: 0.12 + r() * 0.1, cp: C.make(r) }),
    emit(L, st, t, m, out) {
      const u = along(C, t * L.p.w)
      curvePoint(key, L.p.cp, u, tmp)
      curvePoint(key, L.p.cp, u + 0.002, tmp2)
      const ox = tmp[0] * L.p.rad
      const oy = tmp[1] * L.p.rad
      out.push({ ox, oy, a: outwardNormal(ox, oy, tmp2[0] - tmp[0], tmp2[1] - tmp[1]) + m.rot, s: L.speed * m.spd })
    },
    // inherited: the muzzle slides along the curve
    muzzle(p, n, t, cone, o) {
      curvePoint(key, p.cp, along(C, t * p.w * 2), tmp)
      o.lat += 0.16 * p.rad * tmp[0] * cone
    },
    tex: (p) => C.tex(p.cp),
  }
}
function ring(key, noun, N) {
  const C = CURVES[key]
  return {
    kind: 'burst',
    name: C.name,
    noun,
    better: ['rad'],
    make: (r) => ({ rate: 0.7 + r() * 0.4, rad: 40 + r() * 30, N, cp: C.make(r), k: 1, dd: 0, w: 0.3 }),
    emit(L, st, t, m, out) {
      const { N: n, rad, cp } = L.p
      for (let j = 0; j < n; j++) {
        curvePoint(key, cp, j / n, tmp)
        curvePoint(key, cp, j / n + 0.002, tmp2)
        const ox = tmp[0] * rad
        const oy = tmp[1] * rad
        out.push({ ox, oy, a: outwardNormal(ox, oy, tmp2[0] - tmp[0], tmp2[1] - tmp[1]) + m.rot, s: L.speed * m.spd }) // no neighbour threads: corners fling neighbours far apart
      }
    },
    muzzle(p, n, t, cone, o) {
      curvePoint(key, p.cp, (n * 0.137) % 1, tmp)
      o.lat += 0.16 * p.rad * tmp[0] * cone
    },
    tex: (p) => C.tex(p.cp),
  }
}
Object.assign(SPAWNERS, {
  epicycloid: walker('epicycloid', 'Bloom', 22),
  hypocycloid: walker('hypocycloid', 'Astroid', 22),
  limacon: walker('limacon', 'Cardioid', 24),
  koch: walker('koch', 'Snowflake', 26),
  dragon: walker('dragon', 'Dragon', 26),
  frost: ring('koch', 'Frost', 54),
  petals: ring('epicycloid', 'Petals', 60),
  // Chaos game: a point jumps halfway to a random corner of a triangle, tracing the
  // Sierpiński gasket; bullets leave outward from it.
  chaos: {
    kind: 'stream',
    name: 'Chaos game',
    noun: 'Gasket',
    better: ['rad'],
    make: (r) => ({ rate: 30 + r() * 12, rad: 80 + r() * 40, rot: r() * TAU, w: 0.1 }),
    emit(L, st, t, m, out) {
      if (!st.rng) st.rng = mulberry32(7)
      if (st.cx === undefined) {
        st.cx = 0
        st.cy = 0
      }
      const v = Math.floor(st.rng() * 3)
      const a = L.p.rot + (TAU * v) / 3
      st.cx = (st.cx + Math.cos(a)) / 2
      st.cy = (st.cy + Math.sin(a)) / 2
      const ox = st.cx * L.p.rad
      const oy = st.cy * L.p.rad
      out.push({ ox, oy, a: Math.atan2(oy, ox) + m.rot, s: L.speed * m.spd })
    },
    muzzle(p, n, t, cone, o) {
      o.lat += 0.16 * p.rad * Math.sin(n * 2.399) * cone
    },
    tex: () => 'x → (x + vᵢ)/2,  vᵢ random triangle corner',
  },
})
