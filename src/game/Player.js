// The player's ship: movement, the three-stream auto-fire and life (streams plus
// everything inherited). Pure state; sparks and sounds are the caller's business.
import { W, H, P, PB_R, PB_R_CENTRE, CENTRE_DMG } from '../core/config.js'
import { GOLDEN } from '../core/math.js'
import { modulate, muzzle, motionDescs, shotDescs, countInherited, removeRandom, SLOT_LABEL } from './arsenal.js'

export class Player {
  constructor() {
    this.x = W / 2
    this.y = H - 170
    this.px = this.x
    this.py = this.y
    this.vx = 0
    this.vy = 0
    this.hp = P.hp
    this.inv = 1.5
    this.alive = true
    this.aim = -Math.PI / 2
    this.fa = 0
    this.focus = false
    this.streams = 3
    this.shot = 0
    this.mod = { rot: 0, spread: 1, rate: 1, spd: 1, morph: 0 }
    this.mz = { da: 0, lat: 0 }
  }

  // Aim: normal mode passes the boss as `target` (the player always faces it); hard mode
  // passes null and the player aims at the mouse.
  move(dt, input, target) {
    this.px = this.x // where it was a step ago: collisions are swept between the two
    this.py = this.y
    const { x: ix, y: iy } = input.axis()
    const len = Math.hypot(ix, iy) || 1
    this.focus = input.down('focus')
    const sp = this.focus ? P.focus : P.speed
    const ease = 1 - Math.exp(-dt * 20)
    this.vx += ((ix / len) * sp - this.vx) * ease
    this.vy += ((iy / len) * sp - this.vy) * ease
    this.x = Math.min(W - 16, Math.max(16, this.x + this.vx * dt))
    this.y = Math.min(H - 16, Math.max(16, this.y + this.vy * dt))
    this.inv = Math.max(0, this.inv - dt)
    if (target) this.aim = Math.atan2(target.y - this.y, target.x - this.x)
    else if (input.mouse.seen) this.aim = Math.atan2(input.mouse.y - this.y, input.mouse.x - this.x)
  }

  // Auto-fire: up to three streams (centre + two angled wings), shaped by the
  // inherited arsenal. Pushes bullets into `out`.
  fire(dt, arsenal, t, out) {
    const m = modulate(arsenal, t, this.mod)
    const sh = shotDescs(arsenal) // fission / thorn params, or null
    this.fa += dt * P.fireRate * m.rate
    while (this.fa >= 1) {
      this.fa -= 1
      this.shot++
      const sides = this.streams >= 3 ? [-1, 0, 1] : this.streams === 2 ? [-0.5, 0.5] : [0]
      for (let si = 0; si < sides.length; si++) {
        const side = sides[si]
        const n = this.shot * 3 + si
        const z = muzzle(arsenal, n, t, m.morph, this.mz)
        // the central stream always flies dead straight along the aim: no inherited rhythm,
        // muzzle or flight trait bends it. Only the wings are shaped by the arsenal.
        const centre = side === 0
        const a0 = centre ? this.aim : this.aim + side * 0.1 * m.spread + m.rot + z.da
        const ca = Math.cos(this.aim)
        const sa = Math.sin(this.aim)
        const lat = centre ? 0 : side * 6 + z.lat
        out.push({
          x: this.x + ca * 12 - sa * lat,
          y: this.y + sa * 12 + ca * lat,
          a: a0,
          a0,
          s: P.bspeed * m.spd,
          r: side === 0 ? PB_R_CENTRE : PB_R, // the central stream is thicker
          dmg: side === 0 ? CENTRE_DMG : 1, // and hits three times as hard
          age: 0,
          ac: 0,
          mo: centre ? [] : motionDescs(arsenal, n, Math.sign(side)),
          gen: 0,
          sh,
          th: sh.thorn && n % sh.thorn.every === 0 ? n * GOLDEN : -1, // thorn satellite phase
          cd: 0,
          sx: 0,
          sy: 0,
        })
      }
    }
  }

  // Life is the traits: your streams plus everything you inherited.
  lives(arsenal) {
    return countInherited(arsenal) + this.streams
  }

  // Strip one trait: a random inherited one first, then a stream.
  loseLife(arsenal) {
    const lost = removeRandom(arsenal)
    if (lost) return { changedArsenal: true, text: 'TRAIT LOST', sub: `${lost.entry.name} ${SLOT_LABEL[lost.slot]}` }
    this.streams = Math.max(0, this.streams - 1)
    return { changedArsenal: false, text: 'STREAM LOST', sub: `${this.streams} ${this.streams === 1 ? 'stream' : 'streams'} left` }
  }
}
