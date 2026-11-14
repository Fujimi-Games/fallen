// Procedural score generated from the boss's own trait equations, read live
// from the running simulation (so severing a trait removes its voice):
//   spawner   -> lead melody: the real spawner function is evaluated per note
//   motion    -> vibrato (serpentine), glide (whirling), filter drift (drifting)
//   modulator -> stereo motion / pulse / transposition, with the same parameters
//   path      -> bass line: the boss's x,y on its parametric curve (pan, pitch)
//   chladni   -> pad chord: partials from the plate mode (n,m), crossfading A -> B
//   laser     -> sweeping tone riding the harmonograph angle h(t)
//   melee     -> percussion: blades = Euclidean rhythm, pulse = kick per ring,
//                scythe = noise whoosh following the sector heading
// Web Audio only, no assets. Timbre follows the art direction (a star-chart, not
// an arcade): bells and plucks on a long reverb, singing-bowl drones, soft frame
// drums and finger-cymbal chimes. The notes still come from the equations.
import { SPAWNERS } from '../content/spawners.js'
import { INSTRUMENTS } from './instruments.js'
import { pickEnsemble } from './ensemble.js'
import { evalPath } from '../content/paths.js'
import { flowAngle } from '../content/fields.js'
import { TAU } from '../core/math.js'
import { MenuScore, STEP_SEC } from './menuScore.js'

const SCALES = [
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 1, 3, 5, 7, 8, 10], // phrygian
  [0, 2, 3, 7, 8], // hirajoshi
  [0, 2, 4, 6, 7, 9, 11], // lydian
  [0, 2, 4, 6, 8, 10], // whole tone
  [0, 2, 5, 7, 9], // yo
]
const KEY = 'fallen.sound.v1'
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const fold = (r) => {
  while (r >= 2) r /= 2
  while (r < 1) r *= 2
  return r
}

export class Music {
  constructor(store) {
    this.store = store
    this.ctx = null
    this.on = store.get(KEY) !== 'off'
    this.def = null
    this.step = 0
    this.nextT = 0
    this.stepDur = 0.15
    this.vs = []
    this.pad = null
    this.laser = null
    this.whoosh = null
    this.prev = new Map()
    this.scale = SCALES[0]
    this.base = 110
    this.ens = null
    this.menu = new MenuScore() // the main menu's music: pure mathematics (menuScore.js)
    this.menuStep = 0
    this.menuT = 0
  }

  /* ----------------------------- audio graph ----------------------------- */
  ensure() {
    if (this.ctx) return true
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    const c = new AC()
    this.ctx = c
    this.master = c.createGain()
    this.master.gain.value = this.on ? 0.95 : 0
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.ratio.value = 4
    this.master.connect(comp)
    comp.connect(c.destination)
    // everything passes a soft low-pass: no hard digital edge
    const soft = c.createBiquadFilter()
    soft.type = 'lowpass'
    soft.frequency.value = 5400
    soft.Q.value = 0.4
    soft.connect(this.master)
    this.bus = c.createGain()
    this.bus.gain.value = 1.3
    this.bus.connect(soft)
    this.echo = c.createDelay(1)
    this.echo.delayTime.value = 0.27
    const fb = c.createGain()
    fb.gain.value = 0.3
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1700
    this.echo.connect(lp)
    lp.connect(fb)
    fb.connect(this.echo)
    lp.connect(this.bus)
    this.send = c.createGain()
    this.send.gain.value = 0.34
    this.send.connect(this.echo)
    // a long, dark hall: generated noise with an exponential tail
    const verb = c.createConvolver()
    const sr = c.sampleRate
    const irLen = Math.floor(sr * 3.2)
    const ir = c.createBuffer(2, irLen, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      let lpz = 0
      for (let i = 0; i < irLen; i++) {
        const k = i / irLen
        lpz += (Math.random() * 2 - 1 - lpz) * (0.35 - 0.28 * k) // darker as it decays
        d[i] = lpz * Math.pow(1 - k, 2.6) * 1.6
      }
    }
    verb.buffer = ir
    const verbOut = c.createGain()
    verbOut.gain.value = 0.85
    this.send.connect(verb)
    verb.connect(verbOut)
    verbOut.connect(this.bus)
    const len = c.sampleRate
    this.noise = c.createBuffer(1, len, c.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return true
  }

  resume() {
    if (this.ensure() && this.ctx.state !== 'running') this.ctx.resume()
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend()
  }

  toggle() {
    this.on = !this.on
    this.store.set(KEY, this.on ? 'on' : 'off')
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.95 : 0, this.ctx.currentTime, 0.05)
    return this.on
  }

  panner(pan) {
    const c = this.ctx
    if (!c.createStereoPanner) return null
    const p = c.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    return p
  }

  tone(freq, t, dur, o = {}) {
    const inst = INSTRUMENTS[o.type]
    if (inst) return inst(this, freq, t, dur, o)
    const c = this.ctx
    const { type = 'triangle', gain = 0.1, pan = 0, cutoff = 2600, bend = 0, vib = null, send = true, attack = 0.006 } = o
    const osc = c.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (bend) {
      osc.detune.setValueAtTime(0, t)
      osc.detune.linearRampToValueAtTime(bend, t + dur)
    }
    if (vib) {
      const l = c.createOscillator()
      l.frequency.value = vib.rate
      const lg = c.createGain()
      lg.gain.value = vib.cents
      l.connect(lg)
      lg.connect(osc.detune)
      l.start(t)
      l.stop(t + dur + 0.1)
    }
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(f)
    f.connect(g)
    let out = g
    const p = this.panner(pan)
    if (p) {
      g.connect(p)
      out = p
    }
    out.connect(this.bus)
    if (send) out.connect(this.send)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  // Play a registered instrument by name.
  play(name, freq, t, dur, o = {}) {
    INSTRUMENTS[name](this, freq, t, dur, o)
  }

  // Common output chain for the instruments: low-pass, envelope-free gain, pan, sends.
  chain(o) {
    const c = this.ctx
    const { gain = 0.1, pan = 0, cutoff = 4200, send = true } = o
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = c.createGain()
    g.gain.value = gain
    f.connect(g)
    let out = g
    const p = this.panner(pan)
    if (p) {
      g.connect(p)
      out = p
    }
    out.connect(this.bus)
    if (send) out.connect(this.send)
    return f
  }

  // pitch movement shared by an instrument's oscillators: a glide and/or vibrato
  pitchMods(oscs, t, dur, o) {
    const c = this.ctx
    if (o.bend) for (const osc of oscs) {
      osc.detune.setValueAtTime(0, t)
      osc.detune.linearRampToValueAtTime(o.bend, t + dur)
    }
    if (o.vib) {
      const l = c.createOscillator()
      l.frequency.value = o.vib.rate
      const lg = c.createGain()
      lg.gain.value = o.vib.cents
      l.connect(lg)
      for (const osc of oscs) lg.connect(osc.detune)
      l.start(t)
      l.stop(t + dur + 0.1)
    }
  }

  // A partial: a sine with its own exponential decay.
  partial(dest, freq, t, amp, ring, attack = 0.004) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq, t)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(amp, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + ring + 0.05)
    return o
  }

  // Finger cymbal: a small high ping.
  chime(freq, t, gain = 0.05, pan = 0) {
    const dest = this.chain({ gain, pan, cutoff: 8000 })
    this.partial(dest, freq, t, 1, 0.7, 0.002)
    this.partial(dest, freq * 2.4, t, 0.35, 0.35, 0.002)
  }

  // Soft frame drum: a sine that falls to a low thud, with a breath of skin.
  kick(t, f0 = 130, gain = 0.4) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0 * 0.8, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.2)
    const g = c.createGain()
    g.gain.setValueAtTime(gain * 0.85, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(g)
    g.connect(this.bus)
    g.connect(this.send)
    o.start(t)
    o.stop(t + 0.55)
    this.hit(t, 0.09, 420, 0.7, gain * 0.25)
  }

  // A breath of noise (brush / dust / wind). Quieter and rounder than a click.
  hit(t, dur, freq, q, gain, pan = 0) {
    const c = this.ctx
    const s = c.createBufferSource()
    s.buffer = this.noise
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = Math.min(freq, 3200)
    f.Q.value = Math.min(q, 1.4)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain * 0.7, t + Math.min(0.012, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f)
    f.connect(g)
    let out = g
    const p = this.panner(pan)
    if (p) {
      g.connect(p)
      out = p
    }
    out.connect(this.bus)
    out.connect(this.send)
    s.start(t)
    s.stop(t + dur + 0.02)
  }

  /* ------------------------- deriving the music --------------------------- */
  setBoss(def) {
    this.def = def
    const semi = Math.floor((def.hues[0] / 360) * 12) % 12
    this.base = 110 * Math.pow(2, semi / 12)
    this.scale = SCALES[Math.abs(def.id) % SCALES.length]
    // tempo from the primary emitter's rate: streams lock a 16th note to rate/k,
    // bursts get one bar (8 steps) per burst
    const L0 = def.layers[0]
    let bpm
    if (SPAWNERS[L0.spawner].kind === 'stream') {
      let k = 1
      while ((L0.rate * 15) / k > 150) k++
      bpm = (L0.rate * 15) / k
      if (bpm < 90) bpm *= 2
    } else bpm = 120 * L0.rate
    bpm = clamp(bpm, 84, 150)
    this.stepDur = 60 / bpm / 4
    // the echo is a dotted eighth: three steps
    if (this.echo) this.echo.delayTime.value = clamp(this.stepDur * 3, 0.18, 0.5)
    this.step = 0
    this.vs = []
    this.ens = pickEnsemble(def) // which instrument plays what, from this boss's seed
    this.prev.clear()
    this.disposeVoices()
    if (this.ctx) this.nextT = this.ctx.currentTime + 0.1
  }

  disposeVoices() {
    for (const v of [this.pad, this.laser, this.whoosh]) {
      if (!v) continue
      try {
        for (const o of v.oscs) o.stop()
      } catch {
        /* already stopped */
      }
      try {
        v.out.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.pad = null
    this.laser = null
    this.whoosh = null
  }

  freqAt(idx, octave) {
    const L = this.scale.length
    return this.base * Math.pow(2, octave + this.scale[((idx % L) + L) % L] / 12 + Math.floor(idx / L))
  }

  /* ------------------------------- per frame ------------------------------- */
  update(game) {
    if (!this.ctx) return
    if (game.mode === 'attract') {
      this.updateMenu()
      return
    }
    if (!this.def) return
    const c = this.ctx
    const now = c.currentTime
    const mood = game.mode === 'fight' ? 1 : game.mode === 'intro' ? 0.5 : 0
    if (this.nextT < now) this.nextT = now + 0.05
    while (this.nextT < now + 0.12) {
      if (mood > 0 && this.on) this.scheduleStep(game, this.step, this.nextT, mood)
      this.nextT += this.stepDur
      this.step++
    }
    this.continuous(game, now, mood)
  }

  // The main menu: play the generated score, step by step, a little ahead of the clock.
  updateMenu() {
    const now = this.ctx.currentTime
    if (this.menuT < now) this.menuT = now + 0.1
    while (this.menuT < now + 0.25) {
      if (this.on) for (const e of this.menu.step(this.menuStep)) this.play(e.inst, e.freq, this.menuT + e.at, e.dur, { gain: e.gain, pan: e.pan })
      this.menuT += STEP_SEC
      this.menuStep++
    }
  }

  scheduleStep(game, step, T, mood) {
    const b = game.boss
    const def = b.def
    const sd = this.stepDur

    // bass: the boss's position on its parametric path -> degree and pan.
    // Severing the path trait silences it.
    if (step % 4 === 0 && !b.frozen) {
      const [u, v] = evalPath(def.path, b.t)
      const deg = Math.floor(((v + 1) / 2) * this.scale.length * 0.999)
      this.tone(this.freqAt(deg, -0.5), T, sd * 3.6, { type: this.ens.bass, gain: 0.12 * mood, pan: u * 0.5, cutoff: 700, send: false })
    }

    let vi = 0
    for (const R of b.layers) {
      const L = R.L
      if (R.off) continue
      if (L.type === 'emitter') {
        this.lead(R, vi, step, T, mood, b)
        // every trait owns an audible voice, so severing it makes that voice drop
        if (!R.noMotion && L.motion) this.motionVoice(R, vi, step, T, mood, b)
        if (!R.noMod && L.mod) this.modVoice(R, vi, step, T, mood, b)
        vi++
      } else if (L.type === 'melee') {
        this.melee(R, step, T, mood)
      }
    }
  }

  // Motion trait voice: the flight law, heard.
  motionVoice(R, vi, step, T, mood, b) {
    const L = R.L
    const mp = L.mp
    const sd = this.stepDur
    if (L.motion === 'straight') {
      if (step % 4 === 2) this.chime(this.freqAt(0, 3 + vi), T, 0.04 * mood)
    } else if (L.motion === 'snake') {
      if (step % 2 === 1) this.tone(this.freqAt(2 + vi * 2, 2), T, sd * 1.7, { type: this.ens.motion.snake, gain: 0.07 * mood, pan: Math.sin(b.t * mp.w), vib: { rate: mp.w * 2, cents: mp.A * 70 } })
    } else if (L.motion === 'curl') {
      if (step % 4 === 0) this.tone(this.freqAt(4 + vi, 2), T, sd * 3.6, { type: this.ens.motion.curl, gain: 0.065 * mood, bend: mp.w * 1400 * L.curlDir })
    } else if (step % 2 === 1) {
      this.hit(T, sd * 1.6, 500 + 1500 * (0.5 + 0.5 * Math.sin(flowAngle(b.x, b.y, b.t))), 2, 0.06 * mood, Math.sin(b.t))
    }
  }

  // Modulator trait voice: the rhythm law, heard.
  modVoice(R, vi, step, T, mood, b) {
    const L = R.L
    const p = L.modP
    const sd = this.stepDur
    if (L.mod === 'spin') {
      if (step % 3 === 0) this.tone(this.freqAt(((step / 3) | 0) % 5 + 3 + vi, 3), T, sd * 1.3, { type: this.ens.mod.spin, gain: 0.06 * mood, pan: Math.sin(p.w * b.t * 4), cutoff: 5000 })
    } else if (L.mod === 'pendulum') {
      if (step % 4 === 0) this.tone(this.freqAt(5 + vi, 3), T, sd * 2.2, { type: this.ens.mod.pendulum, gain: 0.07 * mood, pan: Math.sin(p.w * 2 * b.t) })
    } else if (L.mod === 'pulse') {
      if (step % 2 === 0) {
        const k = 1 + 0.5 * p.a * Math.sin(p.w * b.t)
        this.kick(T, 75, 0.16 * mood * k)
        this.tone(this.freqAt(0, 1 + (step % 4 === 0 ? 1 : 0)), T, sd * 1.5, { type: this.ens.mod.pulse, gain: 0.07 * mood * k })
      }
    } else if (step % 8 === 0) {
      const idx = 3 + vi + Math.round(2 * R.m.morph)
      this.tone(this.freqAt(idx, 1), T, sd * 7.5, { type: this.ens.mod.drift, gain: 0.05 * mood })
      this.tone(this.freqAt(idx + 2, 1), T, sd * 7.5, { type: this.ens.mod.drift, gain: 0.04 * mood })
    }
  }

  lead(R, vi, step, T, mood, b) {
    const L = R.L
    const S = SPAWNERS[L.spawner]
    const vs = (this.vs[vi] = this.vs[vi] || { st: {}, out: [], ring: [] })
    const m = R.m
    const total = this.scale.length * 2
    let v
    let pan = 0
    if (S.kind === 'stream') {
      if (step % 2) return
      vs.out.length = 0
      S.emit(L, vs.st, b.t, m, vs.out)
      const o = vs.out[0]
      v = (((o.a % TAU) + TAU) % TAU) / TAU
      pan = clamp(o.ox / 100, -1, 1)
    } else {
      if (step % 8 === 0 || !vs.ring.length) {
        vs.out.length = 0
        S.emit(L, vs.st, b.t, m, vs.out)
        vs.ring = vs.out.map((o) => o.s)
      }
      const j = Math.floor(((step % 8) / 8) * vs.ring.length)
      v = clamp((vs.ring[j] / (L.speed * (m.spd || 1)) - 0.2) / 0.8, 0, 1)
    }
    let idx = Math.min(total - 1, Math.floor(v * total))
    let amp = 0.085 * mood
    let vib = null
    let bend = 0
    let cutoff = 2800
    // modulator: same parameters as the boss
    if (!R.noMod) {
      const p = L.modP
      if (L.mod === 'spin') pan = Math.sin(p.w * b.t * 2)
      else if (L.mod === 'pendulum') pan = clamp(Math.sin(p.w * 2 * b.t) * (p.A / 1.2), -1, 1)
      else if (L.mod === 'pulse') amp *= 1 + p.a * Math.sin(p.w * b.t)
      else idx = Math.max(0, Math.min(total - 1, idx + Math.round(2 * m.morph)))
    }
    // motion: same parameters as the boss
    if (!R.noMotion) {
      const mp = L.mp
      if (L.motion === 'snake') vib = { rate: mp.w * 2, cents: mp.A * 35 }
      else if (L.motion === 'curl') bend = mp.w * 160 * L.curlDir
      else if (L.motion === 'flow') cutoff = 900 + 1800 * (0.5 + 0.5 * Math.sin(flowAngle(b.x, b.y, b.t)))
    }
    const dur = S.kind === 'stream' ? this.stepDur * 1.8 : this.stepDur * 0.95
    this.tone(this.freqAt(idx, 1 + vi), T, dur, { type: this.ens.lead[L.index] || 'bell', gain: amp, pan, cutoff, vib, bend })
  }

  melee(R, step, T, mood) {
    const L = R.L
    const stage = R.vis.stage
    const prev = this.prev.get(R) || 0
    if (stage === 2 && prev !== 2) this.kick(T, 150, 0.3 * mood)
    this.prev.set(R, stage)
    if (L.melee !== 'pulse' && L.melee !== 'sweep') {
      // n links/blades/arms -> n hits spread evenly over 16 steps (Euclidean rhythm)
      const n = L.mp.beat
      // finger cymbals, pitched from the shape's own count n
      if (stage === 2 && (step * n) % 16 < n) {
        const f = this.freqAt(n + ((step * n) >> 4), L.melee === 'blades' ? 2 : 3)
        if (L.melee === 'blades') this.tone(f, T, 0.1, { type: 'woodblock', gain: 0.08 * mood, pan: Math.sin(step) })
        else this.chime(f, T, 0.055 * mood, Math.sin(step))
      }
      else if (stage === 1 && step % 4 === 2) this.chime(this.freqAt(n, 4), T, 0.018 * mood)
    } else if (L.melee === 'pulse') {
      if (stage === 2) {
        const ring = Math.floor((R.cyc % L.T - L.rest - L.tele) / L.mp.period)
        const key = R.L.index + ':ring'
        if (this.prev.get(key) !== ring) {
          this.prev.set(key, ring)
          this.kick(T, 90 + L.mp.m * 12, 0.34 * mood)
        }
      } else this.prev.delete(R.L.index + ':ring')
    }
  }

  continuous(game, now, mood) {
    const c = this.ctx
    const b = game.boss
    const live = this.on && mood > 0
    let padG = 0
    let padF = null
    let lasG = 0
    let lasF = this.base * 4
    let lasPan = 0
    let woo = 0
    let wooF = 800
    let wooPan = 0

    for (const R of b.layers) {
      if (R.off) continue
      const L = R.L
      const st = R.vis.stage
      const k = R.vis.k
      if (L.type === 'chladni' && R.vis.A) {
        padG = st === 1 ? 0.03 + 0.05 * k : st === 2 ? 0.1 : st === 3 ? 0.07 * (1 - k) : 0.015
        const [na, ma] = R.vis.A
        const [nb, mb] = R.vis.B
        padF = { a: fold((na * na + ma * ma) / 5), b: fold((nb * nb + mb * mb) / 5), blend: R.vis.blend || 0 }
      } else if (L.type === 'rays' && R.vis.angles) {
        if (st === 1) {
          lasG = 0.02 + 0.05 * k
          lasF = this.base * 4 * (1 + k)
        } else if (st === 2 || st === 3) {
          const tau = R.vis.tau
          const h = L.A1 * Math.sin(L.f1 * tau + L.ph1) + L.A2 * Math.sin(L.f2 * tau + L.ph2)
          lasG = st === 2 ? 0.075 : 0.075 * (1 - k)
          lasF = this.base * 4 * Math.pow(2, h * 1.2)
          lasPan = clamp(Math.cos(R.vis.angles[0]) * 1.2, -1, 1)
        }
      } else if (L.type === 'melee' && L.melee === 'sweep' && st >= 1 && R.shapes.length) {
        woo = st === 2 ? 0.07 : st === 1 ? 0.015 * (1 + k) : 0.07 * (1 - k)
        const a = R.shapes[0].a
        wooF = 500 + 1800 * (0.5 + 0.5 * Math.sin(a))
        wooPan = Math.cos(a)
      }
    }

    if (padF && !this.pad && live) this.pad = this.makePad()
    if (this.pad) {
      const v = this.pad
      const g = live ? padG * mood : 0
      v.out.gain.setTargetAtTime(g, now, 0.15)
      if (padF) {
        const bf = this.base * 2
        v.oscs[0].frequency.setTargetAtTime(bf, now, 0.2)
        v.oscs[1].frequency.setTargetAtTime(bf * padF.a, now, 0.2)
        v.oscs[2].frequency.setTargetAtTime(bf * padF.b, now, 0.2)
        v.gains[1].gain.setTargetAtTime(1 - padF.blend, now, 0.1)
        v.gains[2].gain.setTargetAtTime(padF.blend, now, 0.1)
      }
    }
    if ((lasG > 0 || this.laser) && !this.laser && live) this.laser = this.makeLaser()
    if (this.laser) {
      this.laser.out.gain.setTargetAtTime(live ? lasG * mood : 0, now, 0.05)
      this.laser.oscs[0].frequency.setTargetAtTime(lasF, now, 0.04)
      this.laser.oscs[1].frequency.setTargetAtTime(lasF * 2, now, 0.04)
      if (this.laser.pan) this.laser.pan.pan.setTargetAtTime(lasPan, now, 0.05)
    }
    if (woo > 0 && !this.whoosh && live) this.whoosh = this.makeWhoosh()
    if (this.whoosh) {
      this.whoosh.out.gain.setTargetAtTime(live ? woo * mood : 0, now, 0.06)
      this.whoosh.filter.frequency.setTargetAtTime(wooF, now, 0.05)
      if (this.whoosh.pan) this.whoosh.pan.pan.setTargetAtTime(wooPan, now, 0.05)
    }
  }

  makePad() {
    const c = this.ctx
    const out = c.createGain()
    out.gain.value = 0
    const oscs = []
    const gains = []
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator()
      o.type = 'sine'
      const g = c.createGain()
      g.gain.value = i === 0 ? 0.7 : 0.5
      o.connect(g)
      g.connect(out)
      o.start()
      oscs.push(o)
      gains.push(g)
    }
    out.connect(this.bus)
    out.connect(this.send)
    return { out, oscs, gains }
  }

  makeLaser() {
    const c = this.ctx
    // a theremin-like voice: a sine and a slightly detuned triangle an octave up
    const o = c.createOscillator()
    o.type = 'sine'
    const o2 = c.createOscillator()
    o2.type = 'triangle'
    o2.detune.value = 8
    const g2 = c.createGain()
    g2.gain.value = 0.25
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1800
    const g = c.createGain()
    g.gain.value = 0
    o.connect(f)
    o2.connect(g2)
    g2.connect(f)
    f.connect(g)
    const pan = this.panner(0)
    let out = g
    if (pan) {
      g.connect(pan)
      out = pan
    }
    out.connect(this.bus)
    out.connect(this.send)
    o.start()
    o2.start()
    return { out: g, oscs: [o, o2], pan }
  }

  makeWhoosh() {
    const c = this.ctx
    const s = c.createBufferSource()
    s.buffer = this.noise
    s.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.2
    const g = c.createGain()
    g.gain.value = 0
    s.connect(filter)
    filter.connect(g)
    const pan = this.panner(0)
    let out = g
    if (pan) {
      g.connect(pan)
      out = pan
    }
    out.connect(this.bus)
    s.start()
    return { out: g, oscs: [s], filter, pan }
  }

  /* --------------------------------- events -------------------------------- */
  // Subscribe to the game's event bus; returns the unsubscribe function.
  attach(events) {
    const offs = ['hit', 'sever', 'win', 'lose', 'swing', 'phase'].map((n) => events.on(n, () => this.event(n)))
    return () => offs.forEach((f) => f())
  }

  event(name) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime + 0.01
    if (name === 'hit') {
      // a dull thud and a low, slightly dissonant bowl
      this.kick(t, 95, 0.5)
      this.play('bowl', this.freqAt(0, 0), t, 0.5, { gain: 0.1 })
      this.play('bowl', this.freqAt(0, 0) * 1.414, t, 0.4, { gain: 0.05 })
    } else if (name === 'sever') {
      // a falling run of bells
      for (let i = 0; i < 5; i++) this.play('bell', this.freqAt(8 - i * 2, 1), t + i * 0.08, 0.5, { gain: 0.1 })
      this.hit(t, 0.4, 2400, 0.7, 0.06)
    } else if (name === 'win') {
      // a rising run of bells over a bowl chord
      for (let i = 0; i < 10; i++) this.play('bell', this.freqAt(i, 1), t + i * 0.1, 1.2, { gain: 0.085 })
      this.play('bowl', this.freqAt(0, 0), t, 2.2, { gain: 0.09 })
      this.play('bowl', this.freqAt(2, 0), t + 0.2, 2, { gain: 0.07 })
      this.kick(t, 110, 0.35)
    } else if (name === 'lose') {
      // the light going out: a long falling tone
      const c = this.ctx
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(260, t)
      o.frequency.exponentialRampToValueAtTime(36, t + 1.8)
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 600
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.22, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2)
      o.connect(f)
      f.connect(g)
      g.connect(this.bus)
      g.connect(this.send)
      o.start(t)
      o.stop(t + 2.1)
    } else if (name === 'phase') {
      // a gong, and bells climbing: the boss shifts gear
      this.kick(t, 150, 0.55)
      this.play('bell', this.base * 0.5, t, 3, { gain: 0.2 })
      for (let i = 0; i < 7; i++) this.play('bell', this.freqAt(i * 2, 2), t + i * 0.06, 0.6, { gain: 0.06 })
    } else if (name === 'swing') {
      this.chime(this.freqAt(4, 3), t, 0.06)
    }
  }
}
