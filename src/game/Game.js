// The orchestrator: owns the mode machine and the order things update in, and
// applies the rules that tie systems together (damage, severing, phases, winning,
// dying). Everything else lives in a collaborator it is given or creates:
//   world    sim/World      bullets + boss
//   player   Player         ship, streams, life
//   pm       PlayerMelee    automatic melee
//   run      Run            score, best, record
//   supply   BossSupply     proven bosses, fetched ahead
//   fx       Effects        sparks, shake, grid
//   events   Emitter        what happened (audio and others subscribe)
// No DOM, canvas or audio is touched here, so it runs headless.
import { generateBoss } from '../procgen/generateBoss.js'
import { World } from '../sim/World.js'
import { Emitter } from '../core/events.js'
import { Store } from '../core/storage.js'
import { flowAngle } from '../content/fields.js'
import { Effects } from '../fx/Effects.js'
import { NullAudio } from '../audio/NullAudio.js'
import { Input } from './Input.js'
import { actionOf, loadBindings, saveBindings } from './bindings.js'
import { Player } from './Player.js'
import { PlayerMelee } from './PlayerMelee.js'
import { Run } from './Run.js'
import { BossSupply } from './BossSupply.js'
import { loadArsenal, saveArsenal, emptyArsenal, pickInheritance, inheritTrait, countInherited, SLOT_LABEL } from './arsenal.js'
import { W, H, BOSS_R, INTRO_T, P, BULLET_R, THORN_R, MELEE_STUN } from '../core/config.js'
import { segDist2, sweptTouch } from '../sim/collide.js'

export class Game {
  // deps: { store, events, audio, input, fairClient, onHud }  (all optional)
  constructor(deps = {}) {
    this.store = deps.store ?? new Store(null)
    this.events = deps.events ?? new Emitter()
    this.audio = deps.audio ?? new NullAudio()
    this.input = deps.input ?? new Input()
    this.onHud = deps.onHud
    this.log = deps.log ?? null // optional flight recorder (StateLog)
    if (this.log) this.log.attach(this)
    const fair = deps.fairClient ?? { request: () => new Promise(() => {}), reset() {} }

    this.world = new World(this.events, { pursue: true })
    this.fx = new Effects()
    this.pm = new PlayerMelee()
    this.run = new Run(this.store)
    this.supply = new BossSupply(fair, () => this.emitHud())
    this.arsenal = loadArsenal(this.store)
    this.input.setBindings(loadBindings(this.store))
    this.aimMode = this.store.get('aimMode', 'normal') === 'hard' ? 'hard' : 'normal' // normal: auto-aim at the boss; hard: aim with the mouse

    this.mode = 'attract' // attract | intro | fight | won | lost
    this.paused = false
    this.player = null
    this.pbullets = []
    this.banner = null
    this.resultT = 0
    this.t = 0
    this.advancing = false

    this.input.onPress = (k) => this.onKey(k)
    this.input.onPointer = () => this.audio.resume()
    this.input.onBlur = () => {
      if (this.mode !== 'attract') this.paused = true
    }

    this.newBoss() // unverified placeholder for the attract screen
    this.supply.prefetch(0)
  }

  // the world's pieces, under the names the renderer and audio read
  get boss() {
    return this.world.boss
  }
  get bullets() {
    return this.world.bullets
  }
  set bullets(v) {
    this.world.bullets = v
  }

  destroy() {
    this.supply.destroy()
  }

  /* ------------------------------- controls -------------------------------- */
  onKey(k) {
    this.audio.resume()
    const act = actionOf(this.input.bindings, k)
    if (act === 'sound') this.toggleSound()
    if (act === 'aim') this.setAimMode(this.aimMode === 'hard' ? 'normal' : 'hard')
    if (act === 'pause') this.togglePause()
    if (act === 'restart' && this.mode !== 'attract') this.restartRun()
  }

  // The Settings panel: new bindings take effect at once and are remembered.
  setBindings(b) {
    this.input.setBindings(b)
    saveBindings(this.store, b)
    this.emitHud()
  }

  togglePause() {
    if (this.mode === 'attract') return
    this.paused = !this.paused
    if (this.paused) this.audio.suspend()
    else this.audio.resume()
    this.emitHud()
  }

  toggleSound() {
    this.audio.toggle()
    this.emitHud()
  }

  setAimMode(mode) {
    this.aimMode = mode === 'hard' ? 'hard' : 'normal'
    this.store.set('aimMode', this.aimMode)
    this.emitHud()
  }

  clearArsenal() {
    this.arsenal = emptyArsenal()
    saveArsenal(this.store, this.arsenal)
    this.emitHud()
  }

  /* --------------------------------- flow ---------------------------------- */
  newBoss(seed) {
    const level = this.run.bosses
    const res = seed == null ? this.supply.take(level) : null
    let def
    if (res) {
      def = generateBoss(res.seed, level, res.intensity)
      def.fairness = { ...res.report, intensity: res.intensity, forced: !!res.forced, tries: res.tries }
      this.supply.prefetch(level + 1) // the next boss, assuming this one falls
    } else {
      def = generateBoss(seed ?? (Math.random() * 2147483647) | 0, level)
      def.fairness = null
    }
    if (this.boss) this.fx.dissolve(this.bullets, 0.25, this.boss.def.slotHues)
    this.bullets.length = 0
    this.world.setBoss(def)
    this.events.emit('boss', { def })
    this.audio.setBoss(def)
    this.run.noHit = true
  }

  spawnPlayer() {
    this.player = new Player()
    this.pm.reset()
  }

  beginRun() {
    this.run.begin()
    this.events.emit('run')
    this.arsenal = emptyArsenal() // a run starts with nothing inherited
    saveArsenal(this.store, this.arsenal)
  }

  // Builds the next boss and player once the proven boss for `level` is ready.
  enterFight(level, after = () => {}) {
    this.supply.whenReady(level, () => {
      this.advancing = false
      this.newBoss()
      this.spawnPlayer()
      this.mode = 'intro'
      this.banner = null
      after()
      this.emitHud()
    })
  }

  start() {
    this.audio.resume()
    this.beginRun()
    this.enterFight(0, () => {
      this.paused = false
    })
  }

  // Abandon the run (the score so far still counts toward your best) and start a
  // new one at the slow end of the ramp. There is no re-rolling a harder boss.
  restartRun() {
    this.audio.resume()
    if (this.mode === 'intro' || this.mode === 'fight' || this.mode === 'won') this.events.emit('abandon') // a fallen run has already ended
    this.run.saveBest()
    this.beginRun()
    this.enterFight(0, () => {
      this.pbullets.length = 0
    })
  }

  afterResult() {
    if (this.advancing) return
    this.advancing = true
    if (this.mode === 'lost') this.beginRun()
    this.enterFight(this.run.bosses)
  }

  /* --------------------------------- update --------------------------------- */
  update(dt) {
    this.t += dt
    this.world.t = this.t
    this.fx.update(dt)
    if (this.banner) this.banner.t += dt

    if (this.mode === 'won' || this.mode === 'lost') {
      this.resultT -= dt
      if (this.resultT <= 0) this.afterResult()
    }
    if (this.player) {
      this.updatePlayer(dt)
      this.updatePlayerMelee(dt)
    }
    this.world.target = this.player && this.player.alive ? this.player : null
    this.updateBoss(dt)
    this.updateBullets(dt)
    this.updatePBullets(dt)
    if (this.mode === 'fight') this.checkHazards()
    if (this.log) this.log.tick(this)
  }

  updatePlayer(dt) {
    const p = this.player
    if (!p.alive) return
    p.move(dt, this.input, this.aimMode === 'normal' ? this.boss : null)
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > 40 && Math.random() < dt * 90) {
      const a = Math.atan2(p.vy, p.vx) + Math.PI + (Math.random() - 0.5) * 0.6
      this.fx.spark(p.x - Math.cos(p.aim) * 8, p.y - Math.sin(p.aim) * 8, 190, 1, 40 + Math.random() * 60, 0.35, 72, a)
    }
    if (this.mode !== 'lost') p.fire(dt, this.arsenal, this.t, this.pbullets)
  }

  meleeTiming() {
    return PlayerMelee.timing(this.arsenal, this.audio.stepDur * 4)
  }

  updatePlayerMelee(dt) {
    this.pm.update(dt, {
      player: this.player,
      arsenal: this.arsenal,
      bullets: this.bullets,
      boss: this.boss,
      fighting: this.mode === 'fight',
      beat: this.audio.stepDur * 4,
      fx: this.fx,
      events: this.events,
      hurtBoss: (dmg) => {
        this.damageBoss({ x: this.player.x, y: this.player.y, a: 0 }, dmg)
        this.meleeStun()
      },
    })
  }

  updateBoss(dt) {
    const b = this.boss
    this.world.moveBoss(dt)
    if (b.dead) return
    if (this.mode === 'intro' && b.age > INTRO_T) {
      this.mode = 'fight'
      this.emitHud()
    }
    if (this.mode === 'attract' && b.age > 24) {
      this.newBoss((Math.random() * 2147483647) | 0)
      this.emitHud()
      return
    }
    if (b.stagger > 0) {
      b.stagger -= dt
      return
    }
    if (!(this.mode === 'fight' || this.mode === 'attract') || b.age < INTRO_T) return
    this.world.runAttacks(dt)
  }

  checkHazards() {
    const p = this.player
    if (!p || !p.alive || p.inv > 0) return
    if (this.world.hazardHits(p.x, p.y, P.r)) this.hitPlayer()
  }

  updateBullets(dt) {
    const p = this.player
    const canHit = this.mode === 'fight' && p && p.alive && p.inv <= 0
    const hit = this.world.stepBullets(dt, canHit ? { x: p.x, y: p.y, px: p.px, py: p.py, r: P.r } : null)
    if (hit) this.hitPlayer()
    // let a few bullets tug on the grid
    const arr = this.bullets
    if (arr.length) {
      for (let n = 0; n < 5; n++) {
        const b = arr[(Math.random() * arr.length) | 0]
        this.fx.grid.push(b.x, b.y, 36, -9)
      }
    }
  }

  updatePBullets(dt) {
    const arr = this.pbullets
    const b = this.boss
    const canHit = this.mode === 'fight' && b.age > 1.5
    const hues = b.def.slotHues
    const kids = []
    let w = 0
    for (let i = 0; i < arr.length; i++) {
      const pb = arr[i]
      pb.age += dt
      pb.cd -= dt
      if (pb.mo.length) {
        // every inherited flight law adds to the heading
        let off = 0
        let turn = 0
        for (const d of pb.mo) {
          if (d.m === 1) off += d.p1 * (Math.sin(d.p2 * pb.age + d.ph) - Math.sin(d.ph))
          else if (d.m === 2) turn += d.p1
          else off += d.p1 * Math.sin(flowAngle(pb.x, pb.y, b.t))
        }
        pb.ac += turn * dt
        pb.a = pb.a0 + Math.max(-1.2, Math.min(1.2, off)) + pb.ac
      }
      const ox = pb.x
      const oy = pb.y
      pb.x += Math.cos(pb.a) * pb.s * dt
      pb.y += Math.sin(pb.a) * pb.s * dt
      if (pb.x < -20 || pb.x > W + 20 || pb.y < -40 || pb.y > H + 20) continue

      // boss melee, lasers and thorn satellites cut the player's bullets (bullets never cut bullets)
      if (this.world.cutsAlong(ox, oy, pb.x, pb.y, pb.r)) {
        if (Math.random() < 0.6) this.fx.spark(pb.x, pb.y, hues[b.def.layers.findIndex((l) => l.type === 'melee' || l.type === 'rays') * 2], 2, 150, 0.25, 75)
        continue
      }
      // fission: the bullet splits into a fan of children
      const fi = pb.sh.fission
      if (fi && pb.gen === 0 && pb.age >= fi.delay) {
        for (let k = 0; k < fi.n; k++) {
          const a = pb.a + (k - (fi.n - 1) / 2) * fi.spread
          kids.push({ x: pb.x, y: pb.y, a, a0: a, s: pb.s * fi.mul, r: pb.r, dmg: pb.dmg, age: 0, ac: 0, mo: [], gen: 1, sh: { fission: null, thorn: null }, th: -1, cd: 0, sx: 0, sy: 0 })
        }
        continue
      }
      // thorn: a satellite that is melee. It cuts boss bullets and hurts the boss.
      const th = pb.sh.thorn
      if (th && pb.th >= 0) {
        const ang = pb.th + th.w * pb.age
        const pa = pb.th + th.w * (pb.age - dt)
        const sx0 = ox + Math.cos(pa) * th.rho
        const sy0 = oy + Math.sin(pa) * th.rho
        pb.sx = pb.x + Math.cos(ang) * th.rho
        pb.sy = pb.y + Math.sin(ang) * th.rho
        const bl = this.bullets
        const cr = THORN_R + BULLET_R
        for (let j = 0; j < bl.length; j++) {
          const e = bl[j]
          if (!e.dead && sweptTouch(sx0, sy0, pb.sx, pb.sy, e.px === undefined ? e.x : e.px, e.py === undefined ? e.y : e.py, e.x, e.y, cr)) {
            e.dead = true
            if (Math.random() < 0.7) this.fx.spark(e.x, e.y, hues[e.ci], 2, 170, 0.3, 78)
          }
        }
        if (canHit && !b.dead && pb.cd <= 0) {
          if (segDist2(b.x, b.y, sx0, sy0, pb.sx, pb.sy) < (BOSS_R + THORN_R) * (BOSS_R + THORN_R)) {
            pb.cd = 0.25
            this.damageBoss(pb, pb.dmg)
          }
        }
      }
      // the weak spots first: they orbit around the body, so a shot meets one before the body
      if (canHit && !b.dead && b.stagger <= 0) {
        let hit = null
        let hd = Infinity
        for (const sp of b.activeSpots()) {
          const rr = sp.r + pb.r
          if (segDist2(sp.x, sp.y, ox, oy, pb.x, pb.y) >= rr * rr) continue
          const d = Math.hypot(sp.x - ox, sp.y - oy)
          if (d < hd) {
            hd = d
            hit = sp
          }
        }
        if (hit) {
          this.hitSpot(pb, hit)
          continue
        }
      }
      if (canHit && !b.dead) {
        if (segDist2(b.x, b.y, ox, oy, pb.x, pb.y) < (BOSS_R + pb.r) * (BOSS_R + pb.r)) {
          this.damageBoss(pb, pb.dmg)
          continue
        }
      }
      arr[w++] = pb
    }
    arr.length = w
    for (const k of kids) arr.push(k)
  }

  /* ---------------------------------- rules ---------------------------------- */
  // Your melee landing on the boss shakes it and stops its clock for a moment.
  meleeStun() {
    const b = this.boss
    if (b.dead || b.stagger > 0 || b.stunCd > 0) return
    b.stun = MELEE_STUN.time
    b.stunCd = MELEE_STUN.cooldown
    b.shake = 1
    b.flash = Math.min(1, b.flash + 0.5)
    this.fx.kick(5)
    this.fx.spark(b.x, b.y, b.def.hues[0], 14, 260, 0.35, 74, null, 1.4)
  }


  // A shot on a weak spot wears that spot down (not the trait). When it breaks, the trait
  // loses that spot's bounty at once.
  hitSpot(pb, sp) {
    const b = this.boss
    b.spots[sp.i][sp.j] -= pb.dmg ?? 1
    b.flash = Math.min(1, b.flash + 0.1)
    const t = b.def.traits[sp.i]
    this.fx.spark(sp.x, sp.y, t.color?.h ?? b.def.hues[0], 2, 160, 0.25, 78)
    if (b.spots[sp.i][sp.j] > 0) return
    b.spots[sp.i][sp.j] = 0
    this.events.emit('planet', { trait: t, spot: sp.j })
    this.fx.kick(5)
    this.fx.spark(sp.x, sp.y, b.def.hues[0], 30, 300, 0.6, 76, null, 1.6)
    this.fx.grid.push(sp.x, sp.y, 130, 400)
    this.run.award(0.1 * sp.spot.bounty * this.run.levelFactor())
    this.damageBoss({ x: sp.x, y: sp.y, a: 0 }, sp.spot.bounty)
  }

  // Hits wear down the first trait still standing (melee is last).
  damageBoss(pb, dmg = 1) {
    const b = this.boss
    if (b.dead) return
    const i = b.currentTrait()
    if (i < 0) {
      // bare: no traits, only the finishing hits are left
      if (b.finishHp === undefined || b.stagger > 0.8) return
      b.finishHp -= dmg
      b.flash = Math.min(1, b.flash + 0.35)
      if (Math.random() < 0.5) this.fx.spark(pb.x, pb.y, b.def.hues[0], 2, 220, 0.3, 75, pb.a + Math.PI, 1.2)
      if (b.finishHp <= 0) this.win()
      return
    }
    b.hp -= dmg
    b.tHp[i] -= dmg
    b.flash = Math.min(1, b.flash + 0.35)
    if (Math.random() < 0.5) this.fx.spark(pb.x, pb.y, b.def.hues[0], 2, 220, 0.3, 75, pb.a + Math.PI, 1.2)
    if (Math.random() < 0.15) this.fx.grid.push(pb.x, pb.y, 60, 90)
    if (b.tHp[i] <= 0) this.severTrait(i)
  }

  // A trait has run out of durability: the boss loses it for good. Severing a
  // spawner ends the whole attack, taking its rhythm and flight traits with it.
  severTrait(i) {
    const b = this.boss
    const t = b.def.traits[i]
    b.sever(i)
    this.run.award((100 + 0.5 * t.hp) * this.run.levelFactor())
    this.events.emit('sever', { trait: t })
    b.stagger = 1.0
    this.world.quiet()
    b.flash = 1
    this.fx.kick(10)
    this.fx.dissolve(this.bullets, 0.4, b.def.slotHues)
    this.bullets.length = 0
    this.fx.spark(b.x, b.y, b.def.hues[0], 90, 420, 0.9, 70, null, 2)
    this.fx.grid.push(b.x, b.y, 320, 700)
    this.banner = { text: 'SEVERED', sub: `${t.name} ${t.label.toLowerCase()}`, t: 0, dur: 1.6, small: true }
    const phase = b.advancePhase() // fury on the last attacking trait, bare when none is left
    if (b.phase.id === 'bare') b.finishHp = b.def.briefHp // a few hits finish it
    if (phase) this.enterPhase(phase)
    this.emitHud()
  }

  enterPhase(phase) {
    const b = this.boss
    b.stagger = 1.4
    this.world.quiet()
    this.events.emit('phase', { phase })
    this.fx.kick(phase.id === 'bare' ? 8 : 16)
    this.fx.spark(b.x, b.y, b.def.hues[2], 120, 520, 1.1, 66, null, 2)
    this.fx.grid.push(b.x, b.y, 420, 1100)
    if (phase.banner) this.banner = { ...phase.banner, t: 0, dur: 2.2, warn: true }
  }

  win() {
    const b = this.boss
    b.dead = true
    b.hp = 0
    this.mode = 'won'
    this.resultT = 3.4
    const noHit = this.run.noHit
    this.run.win()
    this.events.emit('win')
    this.fx.kick(22)
    this.fx.dissolve(this.bullets, 0.6, b.def.slotHues)
    this.bullets.length = 0
    for (let i = 0; i < 4; i++) this.fx.spark(b.x, b.y, b.def.hues[i % 3], 90, 500, 1.4, 68, null, 2)
    this.fx.grid.push(b.x, b.y, 460, 1500)
    const inh = pickInheritance(b.def)
    const got = inheritTrait(this.arsenal, inh.slot, inh.entry)
    const gotAlso = inh.also ? inheritTrait(this.arsenal, inh.also.slot, inh.also.entry) : null
    this.events.emit('inherit', { slot: inh.slot, key: inh.entry.key, kind: got.kind })
    if (gotAlso) this.events.emit('inherit', { slot: inh.also.slot, key: inh.also.entry.key, kind: gotAlso.kind })
    saveArsenal(this.store, this.arsenal)
    this.banner = {
      text: 'BOSS DOWN',
      sub: noHit ? `${b.def.name} · flawless` : b.def.name,
      sub2: `${{ new: 'INHERITED', upgrade: 'UPGRADED', kept: 'ALREADY MASTERED' }[got.kind]} · ${inh.entry.name} ${SLOT_LABEL[inh.slot]}${gotAlso && gotAlso.kind !== 'kept' ? ` + ${inh.also.entry.name}` : ''}`,
      sub2Hue: inh.entry.hue,
      t: 0,
      dur: 3.2,
    }
    this.emitHud()
  }

  lifeCount() {
    return this.player ? this.player.lives(this.arsenal) : countInherited(this.arsenal) + 3
  }

  hitPlayer() {
    const p = this.player
    if (!p || !p.alive || p.inv > 0) return
    this.run.noHit = false
    const info = p.loseLife(this.arsenal)
    if (info.changedArsenal) saveArsenal(this.store, this.arsenal)
    const left = p.lives(this.arsenal)
    p.hp = left
    this.events.emit(left <= 0 ? 'lose' : 'hit')
    this.fx.kick(14)
    this.fx.grid.push(p.x, p.y, 240, 900)
    this.fx.spark(p.x, p.y, 185, 40, 360, 0.7, 85, null, 1.6)
    // clear the blast zone so one mistake is not three
    const keep = []
    for (const b of this.bullets) {
      const dx = b.x - p.x
      const dy = b.y - p.y
      if (dx * dx + dy * dy < 170 * 170) {
        if (Math.random() < 0.5) this.fx.spark(b.x, b.y, this.boss.def.slotHues[b.ci], 1, 160, 0.5, 70)
      } else keep.push(b)
    }
    this.bullets = keep
    if (left <= 0) {
      // no trait of any kind remains
      p.alive = false
      this.mode = 'lost'
      this.resultT = 2.8
      this.run.death()
      this.fx.kick(24)
      for (let i = 0; i < 3; i++) this.fx.spark(p.x, p.y, 185, 70, 460, 1.2, 80, null, 2)
      this.fx.grid.push(p.x, p.y, 420, 1400)
      const n = this.run.bosses
      this.banner = { text: 'YOU FELL', sub: `slain by ${this.boss.def.name}`, sub2: `RUN SCORE ${this.run.score.toLocaleString('en-US')} · ${n} boss${n === 1 ? '' : 'es'}`, sub2Hue: 185, t: 0, dur: 2.7 }
    } else {
      p.inv = 2.2
      this.banner = { text: info.text, sub: info.sub, t: 0, dur: 1.6, small: true, warn: true }
    }
    this.emitHud()
  }

  /* ----------------------------------- hud ----------------------------------- */
  emitHud() {
    const b = this.boss
    this.onHud?.({
      mode: this.mode,
      paused: this.paused,
      busy: !!this.supply.waiting,
      sound: this.audio.on,
      aimMode: this.aimMode,
      bindings: this.input.bindings,
      spots: b.currentTrait() >= 0 ? b.spots[b.currentTrait()].map((hp, j) => ({ hp, max: b.def.weak.stages[b.currentTrait()][j].hp })) : [],
      melee: this.meleeTiming(),
      hp: this.lifeCount(),
      streams: this.player ? this.player.streams : 3,
      inherited: countInherited(this.arsenal),
      wins: this.run.record.wins,
      deaths: this.run.record.deaths,
      score: this.run.score,
      bosses: this.run.bosses,
      best: this.run.best,
      arsenal: this.arsenal,
      def: b.def,
      phase: b.phase.id,
      pace: b.tempo,
      left: b.left,
      traits: b.def.traits.map((t, i) => ({ gone: b.gone[i], hp: b.tHp[i], now: i === b.currentTrait() })),
    })
  }
}