// Weak spots: at least three per stage, different in size and durability, orbiting the boss on a
// parametric path (a trait of the boss); only the current stage's spots can be shot; breaking one
// takes its bounty off the current trait; a fresh set respawns at every stage. The totals match
// the single weak spot they replaced, so the balance is unchanged.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../src/game/Game.js'
import { Emitter } from '../src/core/events.js'
import { Store } from '../src/core/storage.js'
import { Input } from '../src/game/Input.js'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { WEAK, spotOffset } from '../src/content/weakspots.js'
import { STEP, PB_R, PB_R_CENTRE } from '../src/core/config.js'

const tick = () => new Promise((r) => setTimeout(r, 0))
const fair = { request: () => Promise.resolve({ seed: 1, intensity: 0.5, report: { minViable: 1, meanViable: 1, scenarios: 1, horizon: 16, speedFrac: 0.6, margin: 4 } }), reset() {} }

async function arena(seed = 7, level = 4, fire = false) {
  const events = new Emitter()
  const log = []
  events.on('planet', () => log.push('planet'))
  const g = new Game({ store: new Store(null), events, input: new Input(), fairClient: fair })
  await tick()
  g.start()
  await tick()
  const def = generateBoss(seed, level, 0.5)
  g.world.setBoss(def)
  if (!fire) {
    g.player.fire = () => {} // only the shots a test places itself
    g.pm.update = () => {} // and no melee swings
  }
  for (let i = 0; i < 3 / STEP; i++) {
    g.player.inv = 1e9
    g.update(STEP)
  }
  const b = g.boss
  for (const R of b.layers) R.off = true // nothing attacks: this is about our damage
  b.frozen = { x: 270, y: 420 }
  b.x = 270
  b.y = 420
  b.stagger = 0
  g.pbullets.length = 0
  g.bullets.length = 0
  return { g, b, log, def }
}
const shot = (x, y, a, dmg = 1, speed = 600) => ({ x, y, a, a0: a, s: speed, r: dmg > 1 ? PB_R_CENTRE : PB_R, dmg, age: 0, ac: 0, mo: [], gen: 0, sh: { fission: null, thorn: null }, th: -1, cd: 0, sx: 0, sy: 0 })
// fire at a point from just below it, straight up
const shootAt = (g, p, dmg = 1) => {
  g.pbullets.push(shot(p.x, p.y + 30, -Math.PI / 2, dmg))
  for (let i = 0; i < 12; i++) g.update(STEP)
}

test('every stage has 3-5 spots, all different in size, in the brackets, with the old totals', () => {
  for (let level = 0; level < 16; level += 3) {
    for (let s = 1; s <= 10; s++) {
      const def = generateBoss(s * 191 + level, level, 0.5)
      assert.equal(def.weak.stages.length, def.traits.length, 'one set of spots per stage')
      def.weak.stages.forEach((spots, i) => {
        const t = def.traits[i]
        assert.ok(spots.length >= 3 && spots.length <= 5, `${spots.length} spots`)
        const radii = spots.map((x) => x.r)
        assert.equal(new Set(radii).size, spots.length, 'sizes differ')
        assert.ok(radii.every((r) => r >= WEAK.radius[0] && r <= WEAK.radius[1]), `sizes ${radii}`)
        // the totals are those of the single weak spot: 8% durability, 40% bounty (rounding aside)
        const hp = spots.reduce((a, x) => a + x.hp, 0)
        const bounty = spots.reduce((a, x) => a + x.bounty, 0)
        assert.ok(Math.abs(hp - WEAK.hpFrac * t.hp) <= spots.length, `hp ${hp} vs ${WEAK.hpFrac * t.hp}`)
        assert.ok(Math.abs(bounty - WEAK.bounty * t.hp) <= spots.length, `bounty ${bounty} vs ${WEAK.bounty * t.hp}`)
        // and the reward per point of durability is the same for every spot (to rounding)
        for (const x of spots) assert.ok(Math.abs(x.bounty / x.hp - WEAK.bounty / WEAK.hpFrac) < 0.25 * (WEAK.bounty / WEAK.hpFrac) + 1.5)
      })
    }
  }
})

test('the sizes and durabilities are randomised per boss, and reproducible from its seed', () => {
  const a = generateBoss(4242, 5, 0.5).weak
  const b = generateBoss(4242, 5, 0.5).weak
  assert.deepEqual(a.stages, b.stages)
  const counts = new Set()
  const kinds = new Set()
  const hpRatio = []
  for (let s = 1; s <= 60; s++) {
    const w = generateBoss(s * 7, 6, 0.5).weak
    kinds.add(w.kind)
    for (const st of w.stages) {
      counts.add(st.length)
      hpRatio.push(Math.max(...st.map((x) => x.hp)) / Math.min(...st.map((x) => x.hp)))
    }
  }
  assert.deepEqual([...counts].sort(), [3, 4, 5])
  assert.ok(kinds.size >= 3, `orbit curves used: ${[...kinds]}`)
  assert.ok(hpRatio.some((q) => q > 1.5), 'durabilities within a stage are not all alike')
})

test('the orbit is a trait of the boss: a named parametric path with a speed limit', async () => {
  const { b, def } = await arena()
  assert.ok(def.weak.name.startsWith('Orbit') && def.weak.tex.includes('reach'))
  let worst = 0
  let far = 0
  const spots = def.weak.stages[0]
  const prev = spots.map((s) => spotOffset(def.weak, s, 0))
  for (let t = STEP; t < 20; t += STEP) {
    spots.forEach((s, k) => {
      const q = spotOffset(def.weak, s, t)
      worst = Math.max(worst, Math.hypot(q[0] - prev[k][0], q[1] - prev[k][1]) / STEP)
      far = Math.max(far, Math.hypot(...q))
      prev[k] = q
    })
  }
  assert.ok(worst <= WEAK.speed * 1.02, `fastest spot ${worst.toFixed(1)} px/s`)
  assert.ok(far <= def.weak.reach * Math.SQRT2 + 1, `stays within reach ${far.toFixed(0)}`)
  assert.ok(b)
})

test('only the current stage\'s spots can be shot; a shot is spent on the spot and wears only the spot', async () => {
  const { g, b, def } = await arena()
  const cur = b.currentTrait()
  await new Promise((r) => setTimeout(r, 0))
  // let the spots grow in
  for (let i = 0; i < 0.7 / STEP; i++) g.update(STEP)
  const sp = b.activeSpots()
  assert.equal(sp.length, def.weak.stages[cur].length)
  const target = sp[0]
  const hp0 = b.spots[cur][target.j]
  shootAt(g, target, 1)
  assert.equal(b.spots[cur][target.j], hp0 - 1)
  assert.equal(b.tHp[cur], def.traits[cur].hp, 'the trait itself is untouched by spot hits')
  assert.equal(g.pbullets.length, 0, 'the shot is spent on the spot')
  // a spot of another stage is not a target
  const other = def.traits.findIndex((t, i) => i !== cur && !b.gone[i])
  const os = def.weak.stages[other][0]
  const [dx, dy] = spotOffset(def.weak, os, b.t)
  const before = b.spots[other][0]
  shootAt(g, { x: b.x + dx, y: b.y + dy })
  assert.equal(b.spots[other][0], before)
})

test('a fast shot cannot skip over the smallest spot (swept)', async () => {
  const { g, b } = await arena()
  const cur = b.currentTrait()
  for (let i = 0; i < 0.7 / STEP; i++) g.update(STEP)
  const sp = b.activeSpots().sort((a, c) => a.r - c.r)[0]
  const hp0 = b.spots[cur][sp.j]
  // 60px per step; both ends of the step are well clear of a spot only 8px wide
  g.pbullets.push(shot(sp.x, sp.y + 30, -Math.PI / 2, 1, 7200))
  g.update(STEP)
  assert.equal(b.spots[cur][sp.j], hp0 - 1)
})

test('breaking a spot takes its bounty off the trait; breaking them all takes the old 40%', async () => {
  const { g, b, def, log } = await arena()
  const cur = b.currentTrait()
  const t = def.traits[cur]
  for (let i = 0; i < 0.7 / STEP; i++) g.update(STEP)
  const stage = def.weak.stages[cur]
  // break the first one
  let first = b.activeSpots()[0]
  const hpSpot = first.spot
  let guard = 0
  while (b.spots[cur][first.j] > 0 && guard++ < 200) {
    const now = b.activeSpots().find((x) => x.j === first.j)
    shootAt(g, now)
  }
  assert.equal(b.spots[cur][first.j], 0)
  assert.equal(t.hp - b.tHp[cur], hpSpot.bounty, 'exactly its bounty')
  assert.ok(log.includes('planet'))
  // the rest
  for (const s0 of b.activeSpots()) {
    let n = 0
    while (b.spots[cur][s0.j] > 0 && n++ < 200 && b.currentTrait() === cur) shootAt(g, b.activeSpots().find((x) => x.j === s0.j))
  }
  const total = stage.reduce((a, x) => a + x.bounty, 0)
  assert.ok(Math.abs(total - WEAK.bounty * t.hp) <= stage.length)
  assert.equal(t.hp - b.tHp[cur], total, 'all of them: the old 40% in total')
  assert.equal(b.activeSpots().length, 0, 'broken spots do not come back within the stage')
})

test('at each stage a fresh set respawns at full durability, growing in', async () => {
  const { g, b, def } = await arena()
  const first = b.currentTrait()
  for (let i = 0; i < 0.7 / STEP; i++) g.update(STEP)
  // wear a spot of the first stage down a little
  b.spots[first][0] -= 1
  g.damageBoss({ x: b.x, y: b.y, a: 0 }, 1e6) // sever the trait
  assert.ok(b.gone[first])
  b.stagger = 0
  const next = b.currentTrait()
  assert.ok(next > first || b.phase.id !== 'assault')
  if (next >= 0) {
    assert.deepEqual(b.spots[next], def.weak.stages[next].map((s) => s.hp), 'untouched, full durability')
    assert.equal(b.activeSpots().length, 0, 'they have not grown in yet')
    for (let i = 0; i < 0.15 / STEP; i++) g.update(STEP)
    const growing = b.activeSpots()
    assert.ok(growing.length > 0 && growing.every((s) => s.r < s.spot.r), 'growing in: hitbox = what is drawn')
    for (let i = 0; i < 0.6 / STEP; i++) g.update(STEP)
    assert.ok(b.activeSpots().every((s) => Math.abs(s.r - s.spot.r) < 1e-9), 'full size')
  }
})

test('risk/reward is unchanged: perfect play 32% faster, break-even at a 20% hit rate', () => {
  const breakEven = WEAK.hpFrac / WEAK.bounty
  const perfect = 1 - WEAK.bounty + WEAK.hpFrac
  assert.ok(breakEven > 0.15 && breakEven < 0.3)
  assert.ok(perfect > 0.55 && perfect < 0.8)
})
