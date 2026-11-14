// Bullet traits: extra behaviour a spawner's bullets carry. They belong to the
// spawner (the macro trait): they fall with it, and are inherited with it.
//   fission  a bullet splits into n children after `delay` seconds
//              child_k heading = a + (k - (n-1)/2)·Δθ,  speed = mul·speed
//   thorn    every `every`-th bullet carries a satellite on a circle around it
//              x_s = x + ρ·(cos(ωt+φ), sin(ωt+φ))
//            a satellite is a melee shape: it hurts, and it cuts bullets.
import { ramp } from './difficulty.js'
import { range } from '../core/rng.js'

const f = (v, d = 2) => +v.toFixed(d)

export const BULLET_TRAITS = {
  fission: {
    name: 'Fission',
    label: 'Offspring',
    make: (r, level = 0) => {
      const u = ramp(level)
      return {
        delay: f(range(r, 0.55, 1.25)),
        n: 2 + (r() < 0.25 + 0.5 * u ? 1 : 0) + (r() < 0.45 * u ? 1 : 0),
        spread: f(range(r, 0.28, 0.62)),
        mul: f(range(r, 0.88, 1.08)),
      }
    },
    tex: (p) => `b → ${p.n}·b after ${f(p.delay, 1)}s,  Δθ = ${f(p.spread)}`,
  },
  thorn: {
    name: 'Thorned',
    label: 'Thorns',
    make: (r, level = 0) => {
      const u = ramp(level)
      return {
        rho: f(range(r, 15, 24)),
        w: f((r() < 0.5 ? -1 : 1) * range(r, 2.2, 3.2 + 1.2 * u)),
        every: 2 + Math.floor(r() * 3),
      }
    },
    tex: (p) => `x = x_b + ${f(p.rho, 0)}·(cos ${f(Math.abs(p.w), 1)}t, sin ${f(Math.abs(p.w), 1)}t),  1 in ${p.every}`,
  },
}

export const BULLET_KINDS = Object.keys(BULLET_TRAITS)
