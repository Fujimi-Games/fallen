import { MELEE, shapesHit } from '../../content/melee.js'
import { stageOf, trackAim } from './common.js'

const active = (R) => !R.off && R.vis.stage === 2

function touches(world, R, x, y, r) {
  return active(R) && shapesHit(R.shapes, x, y, r)
}

// Melee layer: rest -> tele -> on -> fade. Blades and the scythe keep moving on
// the boss clock; they only hurt (and only cut bullets) while `on`.
export const meleeLayer = {
  type: 'melee',

  update(world, R, dt) {
    const L = R.L
    const b = world.boss
    R.cyc += dt
    trackAim(R, world, dt)
    const tau = R.cyc % L.T
    const [stage, k] = stageOf(L, tau)
    R.vis.stage = stage
    R.vis.k = k
    R.shapes.length = 0
    if (stage === 0) return
    const al = stage === 1 ? 0.25 + 0.5 * k : stage === 3 ? 1 - k : 1
    if (!R.o) R.o = {}
    Object.assign(R.o, { t: b.t, tauOn: tau - L.rest - L.tele, stage, ox: b.x, oy: b.y, base: R.aim, al, scale: L.scale || 1 })
    MELEE[L.melee].shapes(L.mp, R.o, R.shapes)
  },

  hits: touches,
  cuts: touches, // a live melee shape also destroys the player's bullets
}
