// The main menu's music, generated from mathematics alone. No melody is written down: every note
// is the answer to a formula, and nothing repeats exactly.
//
//   pitch    the harmonic series: every note is an integer multiple n of a fundamental, so the
//            whole piece is in just intonation (3:2 is a pure fifth, 5:4 a pure third).
//   harmony  the fundamental moves through the convergents of the golden ratio,
//            1, 3/2, 5/3, 8/5, 13/8, 21/13 (ratios of consecutive Fibonacci numbers, folded into
//            one octave): each chord change comes closer to phi without ever arriving.
//   bells    a golden-ratio walk: note k is the harmonic number floor(frac(k*phi) * 11) + 6.
//            frac(k*phi) is the most even sequence there is (three-gap theorem): the melody
//            visits every degree equally and never falls into a loop.
//   plucks   the logistic map x -> r x (1 - x), with r breathing between 3.55 and 3.95 over 64
//            bars: orderly and chaotic by turns, the same equation that period-doubles into
//            chaos. Its value picks the harmonic number.
//   rhythm   Euclidean rhythms E(k, n): k hits spread as evenly as possible over n steps (the
//            bells play E(5,8), the plucks E(3,8), the chimes E(7,16) across two bars); the
//            rotation advances every bar, so the patterns phase against each other.
//
// Pure and deterministic: same step in, same notes out. Music.js only plays them.

export const PHI = (1 + Math.sqrt(5)) / 2
export const STEP_SEC = 0.5 // one step; 8 per bar -> a 4 s bar (a slow 120 steps per minute)
export const STEPS_PER_BAR = 8
export const ROOT_HZ = 55 // A1

// k hits spread as evenly as possible over n steps (Bjorklund by the floor formula), rotated
export function euclid(k, n, rot = 0) {
  const out = []
  for (let i = 0; i < n; i++) {
    const j = (((i - rot) % n) + n) % n
    out.push(Math.floor(((j + 1) * k) / n) !== Math.floor((j * k) / n))
  }
  return out
}

// Fibonacci numbers and the ratios of consecutive ones, folded into one octave [1, 2)
export const fib = (n) => {
  let a = 0
  let b = 1
  for (let i = 0; i < n; i++) [a, b] = [b, a + b]
  return a
}
export const fold = (r) => {
  while (r >= 2) r /= 2
  while (r < 1) r *= 2
  return r
}
export const CHORD_RATIOS = [2, 3, 4, 5, 6, 7].map((i) => fold(fib(i + 1) / fib(i))) // 1.0.. -> phi, folded

const frac = (x) => x - Math.floor(x)

export class MenuScore {
  constructor() {
    this.x = 0.37 // logistic state
    this.xs = [] // the logistic orbit, one value per pluck, computed as it is needed
    this.hits = { bell: 0, pluck: 0 }
  }

  // the logistic parameter at a bar: breathes slowly between 3.55 and 3.95 (period 64 bars)
  static r(bar) {
    return 3.75 + 0.2 * Math.sin((2 * Math.PI * bar) / 64)
  }

  // the harmonic note n above the fundamental of `bar`
  static root(bar) {
    return ROOT_HZ * CHORD_RATIOS[Math.floor(bar / 4) % CHORD_RATIOS.length]
  }

  // notes to play at global step `n`: [{ inst, freq, dur (s), gain, pan, at (s after the step) }]
  step(n) {
    const bar = Math.floor(n / STEPS_PER_BAR)
    const s = n % STEPS_PER_BAR
    const root = MenuScore.root(bar)
    const out = []

    // drone: a pure fifth and a slightly detuned unison that beats, renewed every four bars
    if (bar % 4 === 0 && s === 0) {
      const len = 4 * STEPS_PER_BAR * STEP_SEC
      out.push({ inst: 'bowl', freq: root, dur: len, gain: 0.1, pan: -0.15, at: 0 })
      out.push({ inst: 'bowl', freq: root * 1.5, dur: len, gain: 0.06, pan: 0.2, at: 0.05 })
      out.push({ inst: 'bowl', freq: root * (1 + 1 / 280), dur: len, gain: 0.04, pan: 0.05, at: 0.1 }) // beats at root/280 Hz
    }

    // bells: E(5,8) rotating one step per bar, notes from the golden-ratio walk over harmonics 6..16
    if (euclid(5, 8, bar % 8)[s]) {
      const k = this.hits.bell++
      const harmonic = 6 + Math.floor(frac(k * PHI) * 11)
      out.push({ inst: 'bell', freq: root * harmonic, dur: 1.6, gain: 0.065, pan: 0.65 * Math.sin(k * 2.399963), at: 0 }) // golden angle in radians
    }

    // plucks: E(3,8), notes from the logistic orbit over harmonics 3..11, an octave or two lower
    if (euclid(3, 8, (bar * 3) % 8)[s]) {
      const i = this.hits.pluck++
      while (this.xs.length <= i) {
        const r = MenuScore.r(bar)
        this.x = r * this.x * (1 - this.x)
        this.xs.push(this.x)
      }
      const harmonic = 3 + Math.floor(this.xs[i] * 9)
      out.push({ inst: 'kalimba', freq: root * harmonic, dur: 0.9, gain: 0.07, pan: -0.5 * Math.cos(i * 2.399963), at: 0.02 })
    }

    // chimes: E(7,16) across two bars, only on the bars where frac(bar*phi) > 0.4 (aperiodic sparseness)
    if (frac(bar * PHI) > 0.4) {
      const sixteenth = (bar % 2) * 8 + s
      if (euclid(7, 16, 0)[sixteenth]) {
        const h = 24 + Math.floor(frac((bar * 8 + s) * PHI) * 9)
        out.push({ inst: 'glass', freq: root * h, dur: 0.8, gain: 0.025, pan: 0.8 * Math.sin(n), at: 0 })
      }
    }
    return out
  }
}
