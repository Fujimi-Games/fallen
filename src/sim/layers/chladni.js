import { chladni, CHLADNI_MODES } from '../../content/fields.js'
import { smooth } from '../../core/math.js'
import { W, H } from '../../core/config.js'
import { stageOf } from './common.js'

// Standing-wave plate: the nodal lines are safe, the antinodes hurt.
export function fieldValue(R, x, y) {
  const u = x / W
  const v = y / H
  const { A, B, blend } = R.vis
  const fa = chladni(A[0], A[1], u, v)
  if (!blend) return fa
  return fa * (1 - blend) + chladni(B[0], B[1], u, v) * blend
}

export const chladniLayer = {
  type: 'chladni',

  // emitters back off a little while a field is building or live
  pressure(R) {
    return !R.off && R.vis.stage >= 1 && R.vis.stage <= 2 ? 0.55 : 1
  },

  update(world, R, dt) {
    const L = R.L
    const prevCycle = Math.floor(R.cyc / L.T)
    R.cyc += dt
    const cycle = Math.floor(R.cyc / L.T)
    if (!R.vis.A || cycle !== prevCycle) {
      const rng = R.st.rng
      const a = CHLADNI_MODES[Math.floor(rng() * CHLADNI_MODES.length)]
      let bm = a
      while (bm === a) bm = CHLADNI_MODES[Math.floor(rng() * CHLADNI_MODES.length)]
      R.vis.A = a
      R.vis.B = bm
    }
    const tau = R.cyc % L.T
    const [stage, k] = stageOf(L, tau)
    R.vis.stage = stage
    R.vis.k = k
    R.vis.blend = stage >= 2 ? smooth(0.45, 0.9, stage === 2 ? k : 1) : 0
  },

  // The hitbox is a disc, so the field hurts if it is dangerous at the centre or
  // anywhere on the disc's rim (8 rim samples: a sliver under 0.08r is the tolerance).
  hits(world, R, x, y, r = 0) {
    if (R.off || R.vis.stage !== 2 || !(R.vis.k > 0.04)) return false
    const thr = R.L.thr
    if (Math.abs(fieldValue(R, x, y)) > thr) return true
    if (!(r > 0)) return false
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      if (Math.abs(fieldValue(R, x + Math.cos(a) * r, y + Math.sin(a) * r)) > thr) return true
    }
    return false
  },
}
