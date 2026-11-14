import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { World } from '../src/sim/World.js'
import { BULLET_TRAITS } from '../src/content/bullets.js'
import { emptyArsenal, inheritTrait, pickInheritance, shotDescs } from '../src/game/arsenal.js'
import { Game } from '../src/game/Game.js'
import { Store } from '../src/core/storage.js'
import { THORN_R, P, STEP } from '../src/core/config.js'

const withBt = (kind, p) => {
  const def = generateBoss(21, 8, 0.5)
  const L = def.layers.find((l) => l.type === 'emitter')
  L.bt = { kind, p }
  return { def, L }
}

test('fission: a parent bullet is replaced by n children after the delay', () => {
  const { def } = withBt('fission', { delay: 0.5, n: 3, spread: 0.4, mul: 1 })
  const w = new World()
  const boss = w.setBoss(def)
  for (let i = 0; i < 800; i++) w.moveBoss(STEP) // let the boss glide into the arena
  for (let i = 0; i < 1200 && !w.bullets.some((b) => b.bt); i++) w.runAttacks(STEP) // until it fires
  const parents = w.bullets.filter((b) => b.bt && b.gen === 0).length
  assert.ok(parents > 0)
  for (let i = 0; i < 0.52 / STEP; i++) w.stepBullets(STEP, null)
  const kids = w.bullets.filter((b) => b.gen === 1)
  assert.equal(kids.length, parents * 3)
  assert.ok(w.bullets.every((b) => b.gen === 1 || !b.bt))
})

test('thorn: the satellite hurts the player and cuts player bullets', () => {
  const { def } = withBt('thorn', { rho: 20, w: 3, every: 1 })
  const w = new World()
  const boss = w.setBoss(def)
  for (let i = 0; i < 800; i++) w.moveBoss(STEP) // let the boss glide into the arena
  for (let i = 0; i < 1200 && !w.bullets.some((x) => x.th >= 0); i++) w.runAttacks(STEP)
  const b = w.bullets.find((x) => x.th >= 0)
  assert.ok(b, 'a thorned bullet exists')
  w.stepBullets(STEP, null)
  // stand on the satellite, away from the bullet itself
  const hit = w.stepBullets(0, { x: b.sx, y: b.sy, px: b.sx, py: b.sy, r: 0 })
  assert.ok(hit, 'satellite touches the player')
  assert.ok(w.cutsPlayerBullet(b.sx, b.sy, 2.6), 'satellite cuts a player bullet')
  assert.ok(Math.hypot(b.sx - b.x, b.sy - b.y) > P.r + 1)
  assert.ok(THORN_R > 0)
})

test('severing the spawner takes its bullet trait with it; severing the trait stops it', () => {
  const def = generateBoss(21, 8, 0.5)
  const w = new World()
  const boss = w.setBoss(def)
  const L = def.layers.find((l) => l.type === 'emitter')
  L.bt = { kind: 'fission', p: { delay: 0.5, n: 2, spread: 0.3, mul: 1 } }
  def.traits.push({ id: 99, kind: 'fission', cat: 'ranged', layer: L.index, hp: 10 })
  const R = boss.layers[L.index]
  R.noBt = false
  boss.gone.push(false)
  boss.left++
  boss.tHp.push(10)
  boss.removeTrait(def.traits[def.traits.length - 1])
  assert.equal(R.noBt, true)
})

test('player inherits a spawner together with its bullet trait ("as a whole")', () => {
  let found = null
  for (let s = 1; s < 300 && !found; s++) {
    const d = generateBoss(s, 10, 1)
    if (!d.layers.some((l) => l.bt)) continue
    for (let k = 0; k < 40; k++) {
      const inh = pickInheritance(d)
      if (inh.slot === 'spawner' && inh.also) found = inh
    }
  }
  assert.ok(found && found.also.slot === 'shot')
  const a = emptyArsenal()
  inheritTrait(a, found.slot, found.entry)
  inheritTrait(a, found.also.slot, found.also.entry)
  assert.equal(a.shot.length, 1)
  assert.ok(shotDescs(a)[found.also.entry.key])
})

test("player fission: the player's bullets split into a fan and keep the same damage rules", async () => {
  const fair = { request: (l) => Promise.resolve({ seed: 1000 + l, intensity: 0.5, report: {} }), reset() {} }
  const g = new Game({ store: new Store(null), fairClient: fair })
  await new Promise((r) => setTimeout(r, 0))
  g.start()
  await new Promise((r) => setTimeout(r, 0))
  g.player.inv = 1e9
  g.arsenal.shot.push({ key: 'fission', p: BULLET_TRAITS.fission.make(() => 0.5, 0) })
  g.arsenal.shot[0].p = { delay: 0.2, n: 3, spread: 0.3, mul: 1 }
  for (let i = 0; i < 0.9 / STEP; i++) g.update(STEP)
  assert.ok(g.pbullets.some((b) => b.gen === 1), 'children exist')
})
