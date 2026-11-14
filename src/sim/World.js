// The attack simulation with no canvas, no DOM and no player. The game renders it,
// and the fairness verifier runs it headless to prove a boss is survivable.
// Everything here is deterministic given the boss definition.
import { evalPath, PATH_BOX } from '../content/paths.js'
import { flowAngle } from '../content/fields.js'
import { angDiff, smooth } from '../core/math.js'
import { W, H, BOSS_Y, THORN_R, BULLET_R } from '../core/config.js'
import { sweptTouch, alongSegment } from './collide.js'
import { BULLET_SPEED_CAP } from '../content/reflex.js'
import { Boss } from './Boss.js'
import { paceAt } from './phases.js'
import { LAYERS } from './layers/index.js'
import { Emitter } from '../core/events.js'

export class World {
  // pursue: boss pace and aim follow world.target (the player). Off for the
  // fairness proof, which assumes the fastest pace and a fixed aim.
  constructor(events = new Emitter(), { pursue = false } = {}) {
    this.events = events
    this.pursue = pursue
    this.target = null
    this.bullets = []
    this.boss = null
    this.t = 0
    this.ringId = 0
    this.scratch = []
    this.kids = []
  }

  setBoss(def) {
    this.boss = new Boss(def)
    return this.boss
  }

  // Advances the boss clock and position.
  moveBoss(dt) {
    const b = this.boss
    const pace = b.phase.pace
    if (this.pursue) {
      const want = this.target ? paceAt(pace, Math.hypot(this.target.x - b.x, this.target.y - b.y)) : pace.far
      b.tempo += (want - b.tempo) * Math.min(1, dt * 5) // eased, so the clock never lurches
    } else b.tempo = pace.near
    b.tick(dt)
    if (b.dead) return
    if (b.frozen) {
      const ch = b.phase.chase
      if (this.pursue && this.target && ch) {
        // hunt: walk toward the player, slowing as it closes to `keep`
        const dx = this.target.x - b.x
        const dy = this.target.y - b.y
        const d = Math.hypot(dx, dy) || 1
        const want = Math.min(1, Math.max(0, (d - ch.keep) / 80))
        const sp = ch.speed * (b.stun > 0 ? 0 : b.tempo) * want
        b.frozen.x = Math.min(W - 50, Math.max(50, b.x + (dx / d) * sp * dt))
        b.frozen.y = Math.min(H - 90, Math.max(70, b.y + (dy / d) * sp * dt))
      }
      b.x = b.frozen.x
      b.y = b.frozen.y
      return
    }
    // glide from the top anchor onto the parametric path, entering from above
    const arrive = Math.min(1, b.t / 1.4)
    const ease = 1 - Math.pow(1 - arrive, 3)
    const a = smooth(1.2, 5, b.t)
    const [u, v] = evalPath(b.def.path, b.t)
    const px = PATH_BOX.cx + PATH_BOX.ax * u
    const py = PATH_BOX.cy + PATH_BOX.ay * v
    const x = W / 2 + (px - W / 2) * a
    const y = BOSS_Y + (py - BOSS_Y) * a
    b.x = x
    b.y = -90 + (y + 90) * ease
  }

  // Runs every live layer for dt real seconds (scaled by the boss phase's tempo).
  runAttacks(dt) {
    const b = this.boss
    const sdt = b.stun > 0 ? 0 : dt * b.tempo
    let pressure = 1
    for (const R of b.layers) {
      const p = LAYERS[R.L.type].pressure
      if (p) pressure = Math.min(pressure, p(R))
    }
    const ctx = { pressure }
    for (const R of b.layers) {
      if (!R.off) LAYERS[R.L.type].update(this, R, sdt, ctx)
    }
  }

  // Stand every attack layer down to its resting state. Called when the boss is
  // staggered: a hazard must never stay drawn while it cannot hurt, so the whole
  // pattern is withdrawn and restarts from rest (with its telegraph) afterwards.
  quiet() {
    for (const R of this.boss.layers) {
      R.cyc = 0
      if (R.vis) {
        R.vis.stage = 0
        R.vis.k = 0
        R.vis.width = 0
        R.vis.blend = 0
      }
      if (R.shapes) R.shapes.length = 0
      if (R.hist) R.hist.length = 0
    }
  }

  // Does any live hazard touch a disc? (the player's hitbox)
  hazardHits(x, y, r) {
    return !!this.hazardAt(x, y, r)
  }

  // The layer whose live hazard touches the disc, or null.
  hazardAt(x, y, r) {
    const b = this.boss
    if (b.dead || b.stagger > 0) return null
    for (const R of b.layers) {
      if (R.off) continue
      const h = LAYERS[R.L.type].hits
      if (h && h(this, R, x, y, r)) return R
    }
    return null
  }

  // Does a boss melee layer (or laser) destroy a player bullet at this point?
  cutsPlayerBullet(x, y, r) {
    const b = this.boss
    for (const R of b.layers) {
      if (R.off) continue
      const c = LAYERS[R.L.type].cuts
      if (c && c(this, R, x, y, r)) return true
    }
    // thorn satellites are melee: they cut the player's bullets too
    const tr = r + THORN_R
    for (const e of this.bullets) {
      if (e.th < 0 || !e.bt) continue
      const dx = e.sx - x
      const dy = e.sy - y
      if (dx * dx + dy * dy < tr * tr) return true
    }
    return false
  }

  // ...anywhere along a straight move (a player bullet covers ~9px per step, more than
  // a thin blade is wide, so a point test at the end of the step can jump over it).
  cutsAlong(x0, y0, x1, y1, r) {
    return alongSegment(x0, y0, x1, y1, 2.5, (x, y) => this.cutsPlayerBullet(x, y, r))
  }

  // Moves every bullet one step and culls the dead ones. Fission parents are
  // replaced by their children, thorn satellites are placed.
  // `tg` = the player ({x, y, px, py, r}: now, a step ago, hitbox radius) or null.
  // A bullet and a satellite touch the player if their discs overlapped at ANY
  // instant of the step (both moved in straight lines), not just at its end.
  // Returns 0 for no hit, 1 for a bullet, 2 for a thorn satellite.
  stepBullets(dt, tg) {
    const arr = this.bullets
    const t = this.boss ? this.boss.t : 0
    const kids = this.kids
    kids.length = 0
    let w = 0
    let hit = 0
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i]
      b.age += dt
      b.px = b.x
      b.py = b.y
      switch (b.m) {
        case 1:
          b.a = b.a0 + b.p1 * (Math.sin(b.p2 * b.age + b.ph) - Math.sin(b.ph))
          break
        case 2:
          b.a += b.p1 * dt
          break
        case 3:
          b.a += angDiff(b.a, flowAngle(b.x, b.y, t)) * Math.min(1, b.p1 * dt)
          break
        default:
      }
      b.x += Math.cos(b.a) * b.s * dt
      b.y += Math.sin(b.a) * b.s * dt
      if (b.dead || b.age > b.life || b.x < -40 || b.x > W + 40 || b.y < -60 || b.y > H + 40) continue
      if (tg && !hit && sweptTouch(b.px, b.py, b.x, b.y, tg.px, tg.py, tg.x, tg.y, tg.r + BULLET_R)) hit = 1
      const bt = b.bt
      if (bt) {
        if (bt.kind === 'fission') {
          if (b.age >= bt.p.delay) {
            this.split(b, bt.p, kids)
            continue
          }
        } else if (b.th >= 0) {
          const pa = b.th + bt.p.w * (b.age - dt)
          const ang = b.th + bt.p.w * b.age
          const sx0 = b.px + Math.cos(pa) * bt.p.rho
          const sy0 = b.py + Math.sin(pa) * bt.p.rho
          b.sx = b.x + Math.cos(ang) * bt.p.rho
          b.sy = b.y + Math.sin(ang) * bt.p.rho
          if (tg && !hit && sweptTouch(sx0, sy0, b.sx, b.sy, tg.px, tg.py, tg.x, tg.y, tg.r + THORN_R)) hit = 2
        }
      }
      arr[w++] = b
    }
    arr.length = w
    for (let i = 0; i < kids.length; i++) arr.push(kids[i])
    return hit
  }

  // A fission parent becomes p.n children fanned around its heading.
  split(b, p, out) {
    for (let k = 0; k < p.n; k++) {
      const a = b.a + (k - (p.n - 1) / 2) * p.spread
      out.push({
        x: b.x,
        y: b.y,
        a,
        a0: a,
        s: Math.min(b.s * p.mul, BULLET_SPEED_CAP),
        age: 0,
        life: Math.max(1, b.life - b.age),
        ci: b.ci,
        m: 0,
        p1: 0,
        p2: 0,
        ph: 0,
        g: ++this.ringId,
        link: false,
        gen: 1,
        bt: null,
        th: -1,
        sx: 0,
        sy: 0,
      })
    }
  }
}
