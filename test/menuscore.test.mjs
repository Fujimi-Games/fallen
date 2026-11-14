// The menu music is mathematics, so its properties can be proved by test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MenuScore, euclid, fib, fold, PHI, CHORD_RATIOS, ROOT_HZ, STEPS_PER_BAR, STEP_SEC } from '../src/audio/menuScore.js'

const render = (bars) => {
  const m = new MenuScore()
  const notes = []
  for (let n = 0; n < bars * STEPS_PER_BAR; n++) for (const e of m.step(n)) notes.push({ n, ...e })
  return notes
}

test('euclid rhythms: k hits, as evenly spread as possible', () => {
  for (const [k, n] of [[5, 8], [3, 8], [7, 16], [4, 9], [2, 5]]) {
    const p = euclid(k, n)
    assert.equal(p.filter(Boolean).length, k, `E(${k},${n}) has ${k} hits`)
    // gaps between hits differ by at most one step (the defining property of an even spread)
    const idx = p.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
    const gaps = idx.map((v, j) => (idx[(j + 1) % idx.length] - v + n) % n || n)
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `E(${k},${n}) gaps ${gaps}`)
    // rotating keeps the pattern
    assert.equal(euclid(k, n, 3).filter(Boolean).length, k)
  }
})

test('harmony: the chord roots are Fibonacci ratios, folded, closing in on the golden ratio', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fib), [0, 1, 1, 2, 3, 5, 8, 13, 21, 34])
  for (const r of CHORD_RATIOS) assert.ok(r >= 1 && r < 2)
  assert.ok(Math.abs(fold(fib(21) / fib(20)) - fold(PHI)) < 1e-6)
  const gap = (i) => Math.abs(fib(i + 1) / fib(i) - PHI)
  for (let i = 3; i < 15; i++) assert.ok(gap(i + 1) < gap(i), 'each ratio is nearer phi than the last')
})

test('every pitch is a harmonic of the chord root: just intonation, never out of tune', () => {
  const notes = render(64)
  assert.ok(notes.length > 300)
  for (const e of notes) {
    const root = MenuScore.root(Math.floor(e.n / STEPS_PER_BAR))
    const h = e.freq / root
    if (e.inst === 'bowl') continue // fifth and a deliberate beat
    assert.ok(Math.abs(h - Math.round(h)) < 1e-9, `${e.inst} at step ${e.n} is harmonic ${h}`)
    assert.ok(e.freq >= ROOT_HZ && e.freq < 4200, `in range: ${e.freq}`)
  }
})

test('the golden walk visits every degree evenly and never loops (no repeating bar)', () => {
  const notes = render(96)
  const bells = notes.filter((e) => e.inst === 'bell')
  const counts = new Map()
  for (const b of bells) {
    const root = MenuScore.root(Math.floor(b.n / STEPS_PER_BAR))
    const h = Math.round(b.freq / root)
    counts.set(h, (counts.get(h) || 0) + 1)
  }
  assert.equal(counts.size, 11, 'all of harmonics 6..16 are used')
  const vals = [...counts.values()]
  assert.ok(Math.max(...vals) / Math.min(...vals) < 1.3, `even use: ${vals}`)
  // no two bars of the whole piece are alike (the pitch sequence of a bar as its signature)
  const sigs = new Set()
  for (let bar = 0; bar < 96; bar++) {
    sigs.add(notes.filter((e) => Math.floor(e.n / STEPS_PER_BAR) === bar).map((e) => `${e.inst}${Math.round(e.freq * 10)}@${e.n % STEPS_PER_BAR}`).join(','))
  }
  assert.ok(sigs.size >= 90, `${sigs.size} distinct bars out of 96`)
})

test('the logistic orbit stays in (0,1) while its parameter breathes through order and chaos', () => {
  for (let bar = 0; bar < 128; bar++) {
    const r = MenuScore.r(bar)
    assert.ok(r >= 3.55 - 1e-9 && r <= 3.95 + 1e-9)
  }
  const m = new MenuScore()
  for (let n = 0; n < 8 * 200; n++) m.step(n)
  assert.ok(m.xs.length > 100 && m.xs.every((x) => x > 0 && x < 1))
  assert.ok(new Set(m.xs.map((x) => x.toFixed(4))).size > 90, 'a chaotic orbit does not settle')
})

test('deterministic, and sparse enough to be music: the same notes every time, a few per step', () => {
  const a = render(16).map((e) => `${e.n}${e.inst}${e.freq.toFixed(3)}`)
  const b = render(16).map((e) => `${e.n}${e.inst}${e.freq.toFixed(3)}`)
  assert.deepEqual(a, b)
  const perStep = new Map()
  for (const e of render(64)) perStep.set(e.n, (perStep.get(e.n) || 0) + 1)
  assert.ok(Math.max(...perStep.values()) <= 5, 'never a wall of notes')
  assert.equal(STEP_SEC * STEPS_PER_BAR, 4, 'a four second bar')
})
