import test from 'node:test'
import assert from 'node:assert/strict'
import { CURVES, CURVE_KEYS, curveSamples, curveLength, curvePoint } from '../src/content/curves.js'
import { MELEE, CURVE_WIRES, shapeHit } from '../src/content/melee.js'
import { SPAWNERS } from '../src/content/spawners.js'
import { PATHS } from '../src/content/paths.js'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { World } from '../src/sim/World.js'
import { mulberry32 } from '../src/core/rng.js'
import { STEP } from '../src/core/config.js'

test('every curve gives a finite, unit-normalised table', () => {
  for (const k of CURVE_KEYS) {
    for (let s = 1; s <= 6; s++) {
      const p = CURVES[k].make(mulberry32(s))
      const pts = curveSamples(k, p, 90, 1)
      assert.equal(pts.length, 90)
      let mx = 0
      for (const [x, y] of pts) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${k} finite`)
        mx = Math.max(mx, Math.hypot(x, y))
      }
      assert.ok(mx <= 1.0001 && mx > 0.5, `${k} radius ${mx}`)
      assert.ok(curveLength(k, p) > 1)
    }
  }
})

test('melee wires from curves stay under 130 links and the chain has no gaps wider than its circles', () => {
  for (const k of CURVE_WIRES) {
    for (let s = 1; s <= 6; s++) {
      const p = MELEE[k].make(mulberry32(s * 11))
      const out = []
      MELEE[k].shapes(p, { t: 1, tauOn: 1, ox: 270, oy: 400, base: 0, al: 1, stage: 2, scale: 1 }, out)
      assert.ok(out.length > 20 && out.length <= 130 * p.sym, `${k} links ${out.length}`)
      for (let i = 1; i < out.length; i++) {
        if (out[i].ch !== out[i - 1].ch) continue
        const d = Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y)
        assert.ok(d <= 2 * p.hit + 6, `${k} gap ${d.toFixed(1)}`) // neighbouring circles (nearly) touch
      }
      assert.ok(out.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)))
      assert.ok(shapeHit(out[0], out[0].x, out[0].y, 3))
    }
  }
})

test('new spawners emit finite bullets; new paths stay in the arena box', () => {
  for (const [key, S] of Object.entries(SPAWNERS)) {
    const p = S.make(mulberry32(5))
    const L = { p, speed: 150 }
    const out = []
    const st = {}
    for (let i = 0; i < 40; i++) S.emit(L, st, i * 0.1, { rot: 0, spd: 1, rate: 1, morph: 0 }, out)
    assert.ok(out.length > 0, key)
    assert.ok(out.every((o) => Number.isFinite(o.ox) && Number.isFinite(o.oy) && Number.isFinite(o.a) && Number.isFinite(o.s)), key)
  }
  for (const key of ['limacon', 'epicycloid', 'hypocycloid', 'koch']) {
    const p = PATHS[key].make(mulberry32(3))
    for (let t = 0; t < 20; t += 0.37) {
      const [u, v] = PATHS[key].at(p, t)
      assert.ok(Number.isFinite(u) && Number.isFinite(v))
    }
  }
})

test('generated bosses with the whole library simulate without NaN', () => {
  const seen = new Set()
  for (let s = 1; s <= 120; s++) {
    const level = (s * 7) % 16
    const def = generateBoss(s, level, 0.5)
    for (const L of def.layers) seen.add(L.spawner || L.melee || L.type)
    const w = new World()
    w.setBoss(def)
    for (let i = 0; i < 360; i++) {
      w.moveBoss(STEP)
      w.runAttacks(STEP)
      w.stepBullets(STEP, null)
    }
    assert.ok(w.bullets.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)), `seed ${s}`)
    assert.ok(Number.isFinite(w.boss.x) && Number.isFinite(w.boss.y), `boss ${s}`)
  }
  for (const k of ['koch', 'dragon', 'frost', 'petals', 'chaos', 'epicycloid', 'limacon', 'hypocycloid']) assert.ok(seen.has(k), `spawner ${k} appears`)
  assert.ok(CURVE_WIRES.some((k) => seen.has(k)), 'a curve wire appears')
})
