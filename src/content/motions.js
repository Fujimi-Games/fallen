// Motion laws: how a bullet moves after it spawns.
import { TAU } from '../core/math.js'

const f = (v, d = 2) => +v.toFixed(d)

/* ------------------------------------------------------------------ */
/* Motion laws                                                         */
/* ------------------------------------------------------------------ */
export const MOTION_CODE = { straight: 0, snake: 1, curl: 2, flow: 3 }

export const MOTIONS = {
  straight: {
    adj: 'Radiant',
    make: () => ({}),
    tex: () => 'θ̇ = 0',
  },
  snake: {
    adj: 'Serpentine',
    make: (r) => ({ A: 0.55 + r() * 0.6, w: 1.8 + r() * 1.8, spread: 0.1 + r() * 0.18 }),
    tex: (p) => `θ = θ₀ + ${f(p.A)}·sin(${f(p.w, 1)}t)`,
  },
  curl: {
    adj: 'Whirling',
    make: (r) => ({ w: 0.45 + r() * 0.55 }),
    tex: (p) => `θ̇ = ±${f(p.w)} rad/s`,
  },
  flow: {
    adj: 'Drifting',
    make: (r) => ({ k: 0.7 + r() * 0.7 }),
    tex: () => 'θ̇ → ∇ field(x, y, t)',
  },
}
