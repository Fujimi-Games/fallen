// The player's automatic melee. It swings on the music's beat grid, every
//   period = beat * ceil(longest (swing duration + cooldown) / beat)
// i.e. the shortest whole number of beats that fits the merged swing, so the hits
// land with the percussion. Cuts boss bullets inside its shape and hurts the boss;
// it does nothing to boss melee zones (melee never counters melee).
import { shapeHit, shapesHit, WIRE_KINDS } from '../content/melee.js'
import { PLAYER_MELEE, swingParts, swingDur, swingCycle, swingShapes } from '../content/playerMelee.js'
import { BOSS_R, BULLET_R } from '../core/config.js'
import { alongSegment } from '../sim/collide.js'

export class PlayerMelee {
  constructor() {
    this.slot = -1
    this.on = false
    this.t = 0
    this.parts = null
    this.dur = 0
    this.shapes = []
    this.cdm = {} // per-shape damage cooldowns
    this.done = {}
    this.px = 0
    this.py = 0
    this.aim = 0
  }

  reset() {
    this.on = false
    this.shapes.length = 0
  }

  static timing(arsenal, beat) {
    const parts = swingParts(arsenal)
    const beats = Math.ceil(swingCycle(parts) / beat)
    return { parts: parts.length, beats, period: beats * beat }
  }

  // env: { player, arsenal, bullets, boss, fighting, beat, fx, events, hurtBoss(dmg) }
  update(dt, env) {
    const { player: p, arsenal, bullets, boss: b, fx, events } = env
    for (const k in this.cdm) this.cdm[k] = Math.max(0, this.cdm[k] - dt)
    const mt = PlayerMelee.timing(arsenal, env.beat)
    const slot = Math.floor(b.age / mt.period)
    if (!this.on && env.fighting && p.alive && slot !== this.slot) {
      this.slot = slot
      this.on = true
      this.t = 0
      this.parts = swingParts(arsenal) // snapshot: losing a trait mid-swing does not break it
      this.dur = swingDur(this.parts)
      this.done = {}
      this.cdm = {}
      events.emit('swing')
      fx.kick(2)
    }
    if (!this.on) {
      this.shapes.length = 0
      return
    }
    this.t += dt
    this.px = p.x
    this.py = p.y
    this.aim = p.aim
    swingShapes(this.parts, this.t, p.x, p.y, p.aim, this.shapes)
    const hues = b.def.slotHues
    for (let j = 0; j < bullets.length; j++) {
      const e = bullets[j]
      if (e.dead) continue
      if (alongSegment(e.px === undefined ? e.x : e.px, e.py === undefined ? e.y : e.py, e.x, e.y, 2.5, (x, y) => shapesHit(this.shapes, x, y, BULLET_R))) {
        e.dead = true
        if (Math.random() < 0.7) fx.spark(e.x, e.y, hues[e.ci], 2, 170, 0.3, 78)
      }
    }
    if (env.fighting && !b.dead && b.age > 1.5) {
      for (let i = 0; i < this.shapes.length; i++) {
        const sh = this.shapes[i]
        if (!shapeHit(sh, b.x, b.y, BOSS_R * 0.85)) continue
        const kind = this.parts[sh.src].kind
        const dmg = PLAYER_MELEE[kind].dmg
        if (kind === 'blades') {
          const key = sh.src * 1000 + sh.idx
          if (!(this.cdm[key] > 0)) {
            this.cdm[key] = 0.2
            env.hurtBoss(dmg)
          }
        } else if (WIRE_KINDS.includes(kind)) {
          // a wire has many links: one damage tick per 0.2s however many touch
          const key = 'w' + sh.src
          if (!(this.cdm[key] > 0)) {
            this.cdm[key] = 0.2
            env.hurtBoss(dmg)
          }
        } else if (!this.done[sh.src]) {
          this.done[sh.src] = true
          fx.kick(6)
          env.hurtBoss(dmg)
        }
        if (b.dead) break
      }
    }
    if (this.t >= this.dur) this.reset()
  }
}
