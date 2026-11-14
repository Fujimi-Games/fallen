// The instrument registry. Each instrument is a function (m, freq, t, dur, opts)
// that builds a note out of Web Audio nodes using the engine's primitives:
//   m.chain(o)               low-pass -> gain -> pan -> bus/reverb, returns the input
//   m.partial(dest,f,t,a,r)  a decaying sine
//   m.pitchMods(oscs,...)    glide / vibrato from the boss's flight laws
// opts: { gain, pan, cutoff, send, bend, vib }. A new instrument is one entry here
// (and a line in ensemble.js to let bosses choose it).
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

// A gain envelope for sustained notes: swell, hold, release.
function swell(m, dest, t, dur, attack, release) {
  const g = m.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(1, t + Math.min(attack, dur * 0.5))
  g.gain.setValueAtTime(1, t + dur)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release)
  g.connect(dest)
  return g
}

function osc(m, type, freq, t, end, dest) {
  const o = m.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.connect(dest)
  o.start(t)
  o.stop(end)
  return o
}

export const INSTRUMENTS = {
  // Glass bell: inharmonic partials, the high ones dying first.
  bell(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 3 + 0.5, 0.8, 3.2)
    const dest = m.chain({ ...o, gain: (o.gain ?? 0.1) * 0.9 })
    const parts = [m.partial(dest, f, t, 1, ring), m.partial(dest, f * 2.01, t, 0.32, ring * 0.55), m.partial(dest, f * 2.76, t, 0.22, ring * 0.4), m.partial(dest, f * 5.4, t, 0.08, ring * 0.2)]
    m.pitchMods(parts, t, ring, o)
  },

  // Soft pluck (kalimba-like triangle that darkens as it decays).
  pluck(m, f, t, dur, o = {}) {
    const c = m.ctx
    const ring = clamp(dur * 2.2 + 0.25, 0.4, 1.5)
    const fl = c.createBiquadFilter()
    fl.type = 'lowpass'
    fl.frequency.setValueAtTime((o.cutoff ?? 3600) * 1.3, t)
    fl.frequency.exponentialRampToValueAtTime(Math.max(500, (o.cutoff ?? 3600) * 0.25), t + ring)
    fl.connect(m.chain({ ...o, cutoff: 9000 }))
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(1, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring)
    g.connect(fl)
    const a = osc(m, 'triangle', f, t, t + ring + 0.05, g)
    const b = m.partial(fl, f * 2, t, 0.25, ring * 0.6)
    m.pitchMods([a, b], t, ring, o)
  },

  // Singing bowl: two close sines that beat slowly, a slow swell.
  bowl(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 2 + 0.6, 0.9, 3)
    const dest = m.chain(o)
    const parts = [m.partial(dest, f, t, 1, ring, 0.04), m.partial(dest, f * 1.004, t, 0.8, ring, 0.05), m.partial(dest, f * 2.7, t, 0.12, ring * 0.5, 0.03)]
    m.pitchMods(parts, t, ring, o)
  },

  // Harp: a plucked string, four harmonics that die at different rates.
  harp(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 2.6 + 0.5, 0.7, 2.2)
    const dest = m.chain({ ...o, gain: (o.gain ?? 0.1) * 0.95, cutoff: o.cutoff ?? 5200 })
    const parts = [1, 2, 3, 4].map((k, i) => m.partial(dest, f * k, t, [1, 0.5, 0.28, 0.14][i], ring * (1 - 0.2 * i), 0.003))
    m.pitchMods(parts, t, ring, o)
  },

  // Kalimba / thumb piano: a bright tink on a short sine.
  kalimba(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 1.6 + 0.3, 0.45, 1)
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 6000 })
    const parts = [m.partial(dest, f, t, 1, ring, 0.002), m.partial(dest, f * 5.4, t, 0.22, 0.14, 0.001), m.partial(dest, f * 2, t, 0.18, ring * 0.5, 0.002)]
    m.pitchMods(parts, t, ring, o)
  },

  // Marimba: wooden, a fundamental and a fast-dying 4th harmonic, with a tap.
  marimba(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 1.4 + 0.25, 0.35, 0.9)
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 4200 })
    const parts = [m.partial(dest, f, t, 1, ring, 0.002), m.partial(dest, f * 4, t, 0.35, ring * 0.22, 0.001), m.partial(dest, f * 9.2, t, 0.08, 0.07, 0.001)]
    m.pitchMods(parts, t, ring, o)
    m.hit(t, 0.03, f * 2, 1, (o.gain ?? 0.1) * 0.5, o.pan || 0)
  },

  // Flute: a breathy sine with a little vibrato.
  flute(m, f, t, dur, o = {}) {
    const c = m.ctx
    const end = t + dur + 0.25
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 3800 })
    const env = swell(m, dest, t, dur, 0.06, 0.2)
    const a = osc(m, 'sine', f, t, end, env)
    const b = c.createGain()
    b.gain.value = 0.18
    b.connect(env)
    const t2 = osc(m, 'triangle', f * 2, t, end, b)
    // breath
    const s = c.createBufferSource()
    s.buffer = m.noise
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = clamp(f * 2, 600, 5000)
    bp.Q.value = 1.2
    const ng = c.createGain()
    ng.gain.value = 0.07
    s.connect(bp)
    bp.connect(ng)
    ng.connect(env)
    s.start(t)
    s.stop(end)
    m.pitchMods([a, t2], t, dur + 0.2, { ...o, vib: o.vib || { rate: 5, cents: 7 } })
  },

  // Bowed strings (cello-like): two detuned saws, heavily filtered, slow bow.
  strings(m, f, t, dur, o = {}) {
    const c = m.ctx
    const end = t + dur + 0.4
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 2600 })
    const env = swell(m, dest, t, dur, 0.16, 0.35)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = clamp(f * 3.2, 500, 1600)
    lp.connect(env)
    const a = osc(m, 'sawtooth', f, t, end, lp)
    const b = osc(m, 'sawtooth', f, t, end, lp)
    a.detune.value = -7
    b.detune.value = 7
    m.pitchMods([a, b], t, dur + 0.4, { ...o, vib: o.vib || { rate: 4.6, cents: 6 } })
  },

  // Choir: a saw through vowel formants, a slow swell.
  choir(m, f, t, dur, o = {}) {
    const c = m.ctx
    const end = t + dur + 0.5
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 3400 })
    const env = swell(m, dest, t, dur, 0.22, 0.45)
    const src = c.createGain()
    src.gain.value = 0.5
    const oscs = []
    for (const d of [-9, 0, 9]) {
      const x = osc(m, 'sawtooth', f, t, end, src)
      x.detune.value = d
      oscs.push(x)
    }
    for (const [fc, q, g] of [[700, 6, 1], [1150, 8, 0.6], [2600, 8, 0.25]]) {
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = fc
      bp.Q.value = q
      const gg = c.createGain()
      gg.gain.value = g * 3.6
      src.connect(bp)
      bp.connect(gg)
      gg.connect(env)
    }
    m.pitchMods(oscs, t, dur + 0.5, { ...o, vib: o.vib || { rate: 5.2, cents: 9 } })
  },

  // Handpan: a round, resonant tone with a soft octave and twelfth.
  handpan(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 2.2 + 0.7, 0.9, 2)
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 3600 })
    const parts = [m.partial(dest, f, t, 1, ring, 0.006), m.partial(dest, f * 2, t, 0.5, ring * 0.65, 0.004), m.partial(dest, f * 3, t, 0.2, ring * 0.4, 0.004)]
    m.pitchMods(parts, t, ring, { ...o, bend: o.bend || -14 })
  },

  // Gong: many inharmonic partials with a very long tail.
  gong(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 3 + 1.4, 1.6, 4)
    const dest = m.chain({ ...o, gain: (o.gain ?? 0.1) * 0.6, cutoff: o.cutoff ?? 3200 })
    const parts = [
      [1, 1],
      [1.47, 0.7],
      [2.09, 0.5],
      [2.56, 0.4],
      [3.2, 0.25],
      [4.1, 0.15],
    ].map(([r, a], i) => m.partial(dest, f * r, t, a, ring * (1 - 0.12 * i), 0.01))
    m.pitchMods(parts, t, ring, o)
  },

  // Glass harmonica: a long, pure swell.
  glass(m, f, t, dur, o = {}) {
    const ring = clamp(dur * 1.5 + 0.6, 0.8, 2.4)
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 5200 })
    const parts = [m.partial(dest, f, t, 1, ring, 0.08), m.partial(dest, f * 3, t, 0.18, ring * 0.7, 0.1), m.partial(dest, f * 1.002, t, 0.6, ring, 0.09)]
    m.pitchMods(parts, t, ring, o)
  },

  // Woodblock: a short, dry knock.
  woodblock(m, f, t, dur, o = {}) {
    const dest = m.chain({ ...o, cutoff: o.cutoff ?? 5000 })
    m.partial(dest, f, t, 1, 0.12, 0.001)
    m.partial(dest, f * 2.3, t, 0.4, 0.06, 0.001)
  },
}

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS)
