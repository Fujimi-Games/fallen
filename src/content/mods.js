// Modulators: how a spawner's parameters change over time.
import { TAU } from '../core/math.js'

const f = (v, d = 2) => +v.toFixed(d)

/* ------------------------------------------------------------------ */
/* Modulators                                                          */
/* ------------------------------------------------------------------ */
// at(p, t, out) writes {rot, spd, rate, morph} into out.

export const MODS = {
  spin: {
    name: 'Spin',
    make: (r) => ({ w: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.4) }),
    at: (p, t, o) => {
      o.rot = p.w * t
      o.spd = 1
      o.rate = 1
      o.morph = 0
    },
    tex: (p) => `rot = ${f(p.w)}·t`,
  },
  pendulum: {
    name: 'Pendulum',
    make: (r) => ({ A: 0.8 + r() * 0.9, w: 0.45 + r() * 0.5 }),
    at: (p, t, o) => {
      o.rot = p.A * Math.sin(p.w * t)
      o.spd = 1
      o.rate = 1
      o.morph = 0
    },
    tex: (p) => `rot = ${f(p.A)}·sin(${f(p.w)}t)`,
  },
  pulse: {
    name: 'Pulse',
    make: (r) => ({ w: 0.9 + r() * 0.8, a: 0.28 + r() * 0.12 }),
    at: (p, t, o) => {
      o.rot = 0.12 * t
      o.spd = 1 + p.a * Math.sin(p.w * t)
      o.rate = 1 + 0.5 * p.a * Math.sin(p.w * t + 1)
      o.morph = 0
    },
    tex: (p) => `v × (1 + ${f(p.a)}·sin(${f(p.w)}t))`,
  },
  drift: {
    name: 'Drift',
    make: (r) => ({ w: 0.22 + r() * 0.25 }),
    at: (p, t, o) => {
      o.rot = 0.15 * t
      o.spd = 1
      o.rate = 1
      o.morph = Math.sin(p.w * t)
    },
    tex: (p) => `param += sin(${f(p.w)}t)`,
  },
}
