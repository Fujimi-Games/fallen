// Runtime state of one boss: its traits, durability, phase and clocks.
//   t    boss clock: advances dt * tempo. Every equation, path and shape reads it.
//   age  real seconds since the boss appeared (intro, beat slots).
import { mulberry32 } from '../core/rng.js'
import { PHASES } from './phases.js'
import { SPAWNER_DEPENDENTS, isBulletTrait } from './traits.js'
import { W } from '../core/config.js'
import { WEAK, spotOffset } from '../content/weakspots.js'

function makeLayerState(L, i, defId) {
  return {
    L,
    acc: 0,
    n: 0,
    nb: 0, // bullets emitted (thorn cadence)
    cyc: 0,
    st: { rng: mulberry32(defId + i * 977) },
    m: { rot: 0, spd: 1, rate: 1, morph: 0 },
    vis: { stage: 0, k: 0 },
    hist: [],
    histT: 0,
    shapes: [],
    aim: undefined,
    off: false,
    noMod: !L.mod,
    noMotion: L.type === 'emitter' && !L.motion,
    noBt: !L.bt,
  }
}

export class Boss {
  constructor(def) {
    this.def = def
    this.hp = def.hp
    this.maxHp = def.hp
    this.x = W / 2
    this.y = -90
    this.t = 0
    this.age = 0
    this.tHp = def.traits.map((t) => t.hp) // per-trait durability left
    this.gone = def.traits.map(() => false)
    this.spots = def.weak.stages.map((st) => st.map((s) => s.hp)) // durability of every weak spot, per stage
    this.stageT0 = 0 // when the current stage began (the spots respawn then)
    this.left = def.traits.length
    this.frozen = null
    this.stagger = 0
    this.flash = 0
    this.stun = 0 // seconds left of a melee stun: the boss clock is stopped
    this.stunCd = 0 // seconds until it can be stunned again
    this.shake = 0 // 1 right after a melee hit, fades out; drawn as a tremor
    this.dead = false
    this.rot = 0
    this.finishHp = undefined // set when the last trait falls
    this.phaseIndex = 0
    this.tempo = PHASES[0].pace.far // current clock rate (the game eases it with distance; the proof uses pace.near)
    this.layers = def.layers.map((L, i) => makeLayerState(L, i, def.id))
  }

  get phase() {
    return PHASES[this.phaseIndex]
  }

  // Hits always wear down the first trait still standing: ranged first, then
  // movement, then melee last (traits are ordered that way).
  // The weak spots that can be shot right now: those of the current stage that are still
  // intact, with their position on the orbit and their size (they grow in when they respawn).
  activeSpots() {
    const i = this.currentTrait()
    if (i < 0 || this.dead) return []
    const k = Math.min(1, (this.age - this.stageT0) / WEAK.spawn)
    if (k <= 0.05) return []
    const grow = k * k * (3 - 2 * k)
    const out = []
    this.def.weak.stages[i].forEach((s, j) => {
      if (this.spots[i][j] <= 0) return
      const [dx, dy] = spotOffset(this.def.weak, s, this.t)
      out.push({ i, j, x: this.x + dx, y: this.y + dy, r: s.r * grow, hp: this.spots[i][j], spot: s })
    })
    return out
  }

  // From fury on the flight path is suspended, so it is no longer a target.
  currentTrait() {
    return this.def.traits.findIndex((t, i) => !this.gone[i] && !(this.phaseIndex > 0 && t.cat === 'movement'))
  }

  tick(dt) {
    this.age += dt
    const rate = this.stun > 0 ? 0 : this.tempo // stunned: every equation, path and shape holds still
    this.t += dt * rate
    this.flash = Math.max(0, this.flash - dt * 5)
    this.rot += this.def.spin * dt * rate
    this.stun = Math.max(0, this.stun - dt)
    this.stunCd = Math.max(0, this.stunCd - dt)
    this.shake = Math.max(0, this.shake - dt * 5)
  }

  // Strip one trait. Called when a trait's durability runs out, and by the
  // fairness proof to build each state. Returns the phase if one just began.
  removeTrait(t) {
    if (t.kind === 'path') this.frozen = { x: this.x, y: this.y }
    else {
      const R = this.layers[t.layer]
      if (t.kind === 'mod') R.noMod = true
      else if (t.kind === 'motion') R.noMotion = true
      else if (isBulletTrait(t.kind)) R.noBt = true
      else {
        R.off = true
        R.vis.stage = 0
        R.vis.width = 0
        R.hist.length = 0
        R.shapes.length = 0
      }
    }
  }

  // Removes trait i and everything that depends on it (a spawner takes its
  // rhythm and flight laws with it). Returns the indices removed.
  sever(i) {
    const traits = this.def.traits
    const t = traits[i]
    const out = [i]
    this.removeTrait(t)
    this.gone[i] = true
    this.left--
    this.stageT0 = this.age // a new stage: its weak spots respawn
    if (t.kind === 'spawner') {
      traits.forEach((o, j) => {
        if (!this.gone[j] && o.layer === t.layer && SPAWNER_DEPENDENTS.includes(o.kind)) {
          this.gone[j] = true
          this.left--
          out.push(j)
        }
      })
    }
    return out
  }

  // Moves forward to the latest phase whose condition holds. Returns the new
  // phase when it changed, else null.
  advancePhase() {
    let next = this.phaseIndex
    for (let i = this.phaseIndex + 1; i < PHASES.length; i++) if (PHASES[i].when(this)) next = i
    if (next === this.phaseIndex) return null
    this.phaseIndex = next
    this.tempo = PHASES[next].pace.far
    if (PHASES[next].chase && !this.frozen) this.frozen = { x: this.x, y: this.y } // stop flying the path; the chase takes over
    return PHASES[next]
  }
}
