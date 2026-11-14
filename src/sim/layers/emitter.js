import { BULLET_SPEED_CAP } from '../../content/reflex.js'
import { SPAWNERS } from '../../content/spawners.js'
import { MODS } from '../../content/mods.js'
import { MOTION_CODE } from '../../content/motions.js'
import { TAU, GOLDEN } from '../../core/math.js'

// A spawner (+ optional flight law and rhythm modulator) that fires bullets.
export const emitterLayer = {
  type: 'emitter',

  update(world, R, dt, ctx) {
    const L = R.L
    const b = world.boss
    if (R.noMod) {
      R.m.rot = 0
      R.m.spd = 1
      R.m.rate = 1
      R.m.morph = 0
    } else MODS[L.mod].at(L.modP, b.t, R.m)
    R.acc += dt * L.rate * R.m.rate * ctx.pressure
    while (R.acc >= 1) {
      R.acc -= 1
      emit(world, R)
    }
  },
}

function emit(world, R) {
  const L = R.L
  const b = world.boss
  const out = world.scratch
  out.length = 0
  SPAWNERS[L.spawner].emit(L, R.st, b.t, R.m, out)
  const mc = R.noMotion ? 0 : MOTION_CODE[L.motion]
  const bt = L.bt && !R.noBt ? L.bt : null
  for (let s = 0; s < L.sym; s++) {
    const rot = (TAU * s) / L.sym
    const flip = L.mirror && s & 1
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const g = ++world.ringId
    const ci = L.twoTone && s & 1 ? L.hue2 : L.hue
    for (let i = 0; i < out.length; i++) {
      const o = out[i]
      let ox = o.ox
      let oy = o.oy
      let a = o.a
      if (flip) {
        oy = -oy
        a = -a
      }
      const rx = ox * cs - oy * sn
      const ry = ox * sn + oy * cs
      a += rot
      const bl = {
        x: b.x + rx,
        y: b.y + ry,
        a,
        a0: a,
        s: Math.min(o.s, BULLET_SPEED_CAP),
        age: 0,
        life: L.life,
        ci,
        m: mc,
        p1: 0,
        p2: 0,
        ph: 0,
        g,
        link: !!o.link && mc === 0,
        gen: 0,
        bt,
        th: -1, // satellite phase, or -1 for none
        sx: 0,
        sy: 0,
      }
      if (bt && bt.kind === 'thorn' && ++R.nb % bt.p.every === 0) bl.th = R.nb * GOLDEN
      if (mc === 1) {
        bl.p1 = L.mp.A
        bl.p2 = L.mp.w
        bl.ph = (R.n + i) * L.mp.spread * (flip ? -1 : 1)
      } else if (mc === 2) {
        bl.p1 = L.mp.w * L.curlDir * (flip ? -1 : 1)
      } else if (mc === 3) {
        bl.p1 = L.mp.k
      }
      world.bullets.push(bl)
    }
  }
  R.n++
}
