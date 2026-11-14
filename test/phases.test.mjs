// The phase design, checked on many generated bosses through the real Game and its
// flight recorder:
//   assault  until exactly one trait is left
//   fury     exactly one trait left AND it is melee, at full durability
//   bare     zero traits left
import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../src/game/Game.js'
import { Emitter } from '../src/core/events.js'
import { Store } from '../src/core/storage.js'
import { Input } from '../src/game/Input.js'
import { StateLog } from '../src/game/StateLog.js'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { STEP } from '../src/core/config.js'

const tick = () => new Promise((r) => setTimeout(r, 0))
const fair = { request: () => Promise.resolve({ seed: 1, intensity: 0.5, report: { minViable: 1, meanViable: 1, scenarios: 1, horizon: 16, speedFrac: 0.6, margin: 4 } }), reset() {} }

async function fightWith(def) {
  const log = new StateLog(null)
  const g = new Game({ store: new Store(null), events: new Emitter(), input: new Input(), fairClient: fair, log })
  await tick()
  g.start()
  await tick()
  g.world.setBoss(def)
  g.events.emit('boss', { def })
  for (let i = 0; i < 3 / STEP; i++) {
    g.player.inv = 1e9
    g.update(STEP)
  }
  assert.equal(g.mode, 'fight')
  return { g, log }
}

test('fury and bare trigger exactly as designed, for every kind of boss', async () => {
  let melee = 0
  let rays = 0
  for (const level of [0, 4, 8, 12, 16]) {
    for (let s = 1; s <= 8; s++) {
      const def = generateBoss(s * 977 + level, level, 0.5)
      const { g, log } = await fightWith(def)
      const b = g.boss
      const meleeIdx = def.traits.findIndex((t) => t.cat === 'melee')
      assert.equal(def.traits.filter((t) => t.cat === 'melee').length, 1, 'exactly one melee trait')
      assert.equal(meleeIdx, def.traits.length - 1, 'melee is the last trait')
      if (def.layers.some((l) => l.type === 'rays')) rays++
      else melee++
      let guard = 0
      while (g.mode === 'fight' && b.currentTrait() >= 0 && guard++ < 200000) {
        const left = b.left
        b.stagger = 0
        g.damageBoss({ x: b.x, y: b.y, a: 0 }, 1)
        if (b.left !== left) {
          const rest = def.traits.filter((x, i) => !b.gone[i] && x.cat !== 'movement').length
          const want = rest === 0 ? 'bare' : rest === 1 ? 'fury' : 'assault'
          assert.equal(b.phase.id, want, `${def.code}: ${b.left} trait(s) left`)
        }
      }
      const rec = log.records.filter((r) => r.tag === 'phase')
      assert.deepEqual(rec.map((r) => r.phase), ['fury', 'bare'], `${def.code}: phases seen`)
      // fury began on the melee trait with its durability untouched
      assert.ok(rec[0].standing.includes(`${meleeIdx}:${def.traits[meleeIdx].kind}/melee:${def.traits[meleeIdx].hp}/${def.traits[meleeIdx].hp}`), 'melee at full durability')
      assert.ok(rec[0].standing.every((x) => /melee|movement/.test(x)), 'only melee (and the path) stand')
      assert.equal(rec[1].finishHp, def.briefHp)
    }
  }
  assert.ok(melee > 5 && rays > 5, `both melee kinds covered (${melee} melee, ${rays} rays)`)
})

test('the flight recorder reports boss and player state', async () => {
  const { g, log } = await fightWith(generateBoss(5, 2, 0.5))
  const snap = log.records.filter((r) => r.tag === 'snap').pop()
  assert.ok(snap.boss.standing.length === 3 && snap.boss.phase === 'assault' && snap.boss.tempo > 0)
  assert.ok(snap.player.lives >= 3 && snap.player.alive)
  g.player.inv = 0
  g.hitPlayer()
  assert.equal(log.records.at(-1).tag, 'hit')
})

test('fury starts when one trait is left, not counting the flight path', async () => {
  for (let s = 1; s <= 12; s++) {
    const def = generateBoss(s * 313, 6, 0.5)
    const path = def.traits.findIndex((t) => t.cat === 'movement')
    if (path < 0) continue
    const { g } = await fightWith(def)
    const b = g.boss
    let guard = 0
    while (b.def.traits.some((t, i) => !b.gone[i] && t.cat === 'ranged') && guard++ < 200000) {
      b.stagger = 0
      g.damageBoss({ x: b.x, y: b.y, a: 0 }, 1)
    }
    assert.equal(b.phase.id, 'fury', `${def.code}: fury as the last ranged trait falls`)
    assert.ok(!b.gone[path], 'the path trait is still on the sheet')
    assert.ok(b.frozen, 'but fury suspends it: the boss no longer flies it')
    assert.notEqual(b.currentTrait(), path, 'and it is never a target')
    const meleeIdx = def.traits.findIndex((t) => t.cat === 'melee')
    assert.equal(b.tHp[meleeIdx], def.traits[meleeIdx].hp, 'melee at full durability')
  }
})
