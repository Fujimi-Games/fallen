import { stageOf, trackAim } from './common.js'

// Harmonograph beams: rest -> tele -> on -> fade. Lasers count as melee.
export function rayAngles(R, tau) {
  const L = R.L
  const base = (R.aim === undefined ? Math.PI / 2 : R.aim) + L.drift * tau
  const h = L.A1 * Math.sin(L.f1 * tau + L.ph1) + L.A2 * Math.sin(L.f2 * tau + L.ph2)
  const arr = []
  for (let i = 0; i < L.count; i++) {
    const off = (i - (L.count - 1) / 2) * L.spread
    const sgn = L.cross && i & 1 ? -1 : 1
    arr.push(base + off + h * sgn)
  }
  return arr
}

const live = (R) => !R.off && R.vis.stage === 2 && R.vis.width > 1

export const raysLayer = {
  type: 'rays',

  update(world, R, dt) {
    const L = R.L
    const b = world.boss
    R.cyc += dt
    trackAim(R, world, dt)
    const tau = R.cyc % L.T
    const [stage, k] = stageOf(L, tau)
    R.vis.stage = stage
    R.vis.k = k
    R.vis.tau = tau
    R.vis.angles = rayAngles(R, tau)
    R.vis.width = stage === 2 ? L.width * Math.min(1, (k * L.on) / 0.18) : stage === 3 ? L.width * (1 - k) : 0
    R.histT += dt
    if (stage >= 2 && R.histT > 0.035) {
      R.histT = 0
      R.hist.push({ a: R.vis.angles.slice(), t: 0 })
    }
    for (const h of R.hist) h.t += dt
    while (R.hist.length && R.hist[0].t > 0.7) R.hist.shift()
  },

  // does a disc of radius r at (x,y) touch a live beam?
  hits(world, R, x, y, r) {
    if (!live(R)) return false
    const b = world.boss
    for (const a of R.vis.angles) {
      const qx = x - b.x
      const qy = y - b.y
      const t = qx * Math.cos(a) + qy * Math.sin(a)
      const dist = t < 0 ? Math.hypot(qx, qy) : Math.abs(qx * Math.sin(a) - qy * Math.cos(a))
      if (dist < R.vis.width / 2 + r) return true
    }
    return false
  },

  // a live beam cuts the player's bullets
  cuts(world, R, x, y, r) {
    if (!live(R)) return false
    const b = world.boss
    const qx = x - b.x
    const qy = y - b.y
    for (const a of R.vis.angles) {
      if (qx * Math.cos(a) + qy * Math.sin(a) > 0 && Math.abs(qx * Math.sin(a) - qy * Math.cos(a)) < R.vis.width / 2 + r) return true
    }
    return false
  },
}
