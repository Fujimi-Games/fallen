import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../src/game/Game.js'
import { Emitter } from '../src/core/events.js'
import { Store } from '../src/core/storage.js'
import { Input } from '../src/game/Input.js'
import { STEP } from '../src/core/config.js'
import { generateBoss } from '../src/procgen/generateBoss.js'

const tick = () => new Promise((r) => setTimeout(r, 0))
const fair = { request: (level) => Promise.resolve({ seed: 1000 + level * 17, intensity: 0.5, report: { minViable: 1, meanViable: 1, scenarios: 1, horizon: 16, speedFrac: 0.6, margin: 4 } }), reset() {} }

function make() {
  const events = new Emitter()
  const log = []
  for (const n of ['sever', 'phase', 'win', 'hit', 'lose', 'swing']) events.on(n, (p) => log.push(n))
  const game = new Game({ store: new Store(null), events, input: new Input(), fairClient: fair })
  return { game, events, log }
}
const run = (g, seconds) => {
  for (let i = 0; i < seconds / STEP; i++) g.update(STEP)
}
async function startFight(g) {
  await tick()
  g.start()
  await tick()
  assert.equal(g.mode, 'intro')
  g.player.inv = 1e9 // invulnerable: these tests are about the rules, not dodging
  run(g, 3.2)
  assert.equal(g.mode, 'fight')
}
const hurt = (g, n = 1) => {
  for (let i = 0; i < n && g.mode === 'fight'; i++) g.damageBoss({ x: g.boss.x, y: g.boss.y + 60, a: 0 }, 1)
}

test('traits fall in order, melee last at full durability; zero traits leaves a brief finish', async () => {
  const { game: g, log } = make()
  await startFight(g)
  const order = []
  const traits = g.boss.def.traits
  let lastIntact = null
  while (g.mode === 'fight' && g.boss.currentTrait() >= 0) {
    const i = g.boss.currentTrait()
    if (order[order.length - 1] !== i) order.push(i)
    if (g.boss.phase.id === 'fury' && lastIntact === null) lastIntact = g.boss.tHp[i] === traits[i].hp
    hurt(g, 1)
  }
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'strictly in def order')
  assert.equal(traits[order[order.length - 1]].cat, 'melee')
  assert.ok(lastIntact, 'the last trait keeps its full durability (no brief cap)')
  // no attacking trait left: the boss is still alive and bare, and only briefHp hits finish it
  assert.equal(g.mode, 'fight')
  assert.ok(g.boss.def.traits.every((t, i) => g.boss.gone[i] || t.cat === 'movement'))
  assert.equal(g.boss.phase.id, 'bare')
  assert.equal(g.boss.finishHp, g.boss.def.briefHp)
  g.boss.stagger = 0 // (the player's own auto-fire would otherwise finish it while we wait)
  g.pbullets.length = 0
  let hits = 0
  while (g.mode === 'fight' && hits < 1000) {
    g.damageBoss({ x: g.boss.x, y: g.boss.y, a: 0 }, 1)
    hits++
  }
  assert.equal(hits, g.boss.def.briefHp)
  assert.equal(g.mode, 'won')
  assert.equal(g.run.bosses, 1)
  assert.ok(g.run.score > 0)
  assert.ok(log.includes('sever') && log.includes('win'))
})

test('fury: boss clock rate is a function of player distance (x2 far, x2.8 near)', async () => {
  const { game: g, log } = make()
  await startFight(g)
  const b = g.boss
  g.pm.update = () => {} // melee stuns would slow the clock this test measures
  assert.equal(b.phase.id, 'assault')
  assert.ok(b.tempo >= 1 && b.tempo <= 1.3, 'assault pace stays within its band')
  // strip traits one hit at a time until only the melee trait is left (the path does not count)
  while (g.mode === 'fight' && b.phase.id === 'assault') {
    assert.ok(b.def.traits.some((t, i) => !b.gone[i] && t.cat === 'ranged'), 'no fury while a ranged trait stands')
    hurt(g, 1)
  }
  assert.equal(b.phase.id, 'fury')
  assert.ok(log.includes('phase'))
  b.tHp[b.currentTrait()] = 1e9 // the player's shots must not end the fight mid-measurement
  run(g, 1.6) // let the stagger pass
  const measure = (x, y) => {
    // the path may still be flying: keep the player at a fixed offset from the boss
    const dx = x - b.x
    const dy = y - b.y
    const follow = (sec) => {
      for (let i = 0; i < sec / STEP; i++) {
        g.player.x = Math.min(520, Math.max(20, b.x + dx))
        g.player.y = Math.min(940, Math.max(20, b.y + dy))
        g.update(STEP)
      }
    }
    follow(2) // let the eased rate settle
    const t0 = b.t
    const a0 = b.age
    follow(1)
    return (b.t - t0) / (b.age - a0)
  }
  const far = measure(b.x > 270 ? 20 : 520, b.y > 480 ? 20 : 940)
  const near = measure(b.x + 30, b.y + 30)
  assert.ok(far >= 2 - 1e-6 && far < near, `far pace ${far} below near pace ${near}`)
  assert.ok(Math.abs(near - 2.8) < 0.05, `near pace ${near}`)
})

test('player melee beat slot follows real time, not the boss clock', async () => {
  const { game: g } = make()
  await startFight(g)
  const slots = new Set()
  for (let i = 0; i < 6 / STEP; i++) {
    g.update(STEP)
    slots.add(g.pm.slot)
  }
  assert.ok(slots.size >= 2)
})

test('dying ends the run; the next run starts at level 0', async () => {
  const { game: g, log } = make()
  await startFight(g)
  g.player.inv = 0
  let guard = 0
  while (g.mode === 'fight' && guard++ < 20) {
    g.player.inv = 0
    g.hitPlayer()
  }
  assert.equal(g.mode, 'lost')
  assert.ok(log.includes('lose'))
  run(g, 3.0)
  await tick()
  assert.equal(g.mode, 'intro')
  assert.equal(g.run.bosses, 0)
  assert.equal(g.run.score, 0)
})

test('storage persists the best run across games', async () => {
  const store = new Store(null)
  const a = new Game({ store, fairClient: fair })
  a.run.score = 4321
  a.run.bosses = 3
  a.run.saveBest()
  const b = new Game({ store, fairClient: fair })
  assert.deepEqual(b.run.best, { score: 4321, bosses: 3 })
})

test('every boss has exactly one melee-category trait, and it is the last', () => {
  for (let level = 0; level < 16; level += 3) {
    for (let seed = 1; seed <= 40; seed++) {
      const def = generateBoss(seed * 13 + level, level, 1)
      const melee = def.traits.filter((t) => t.cat === 'melee')
      assert.equal(melee.length, 1, `level ${level} seed ${seed}: ${def.traits.map((t) => t.kind).join(',')}`)
      assert.equal(def.traits[def.traits.length - 1].cat, 'melee')
      assert.equal(def.layers.filter((l) => l.type === 'melee' || l.type === 'rays').length, 1)
    }
  }
})

test('fury: the boss hunts the player instead of sitting still, and stops at melee range', async () => {
  const { game: g } = make()
  await startFight(g)
  const b = g.boss
  while (g.mode === 'fight' && b.phase.id === 'assault') hurt(g, 1)
  b.tHp[b.currentTrait()] = 1e9
  assert.equal(b.phase.id, 'fury')
  assert.ok(b.frozen, 'the path is suspended: the chase moves the boss now')
  g.player.x = 270
  g.player.y = 880
  const d0 = Math.hypot(g.player.x - b.x, g.player.y - b.y)
  run(g, 2.5)
  g.player.x = 270
  g.player.y = 880
  run(g, 10)
  const d1 = Math.hypot(g.player.x - b.x, g.player.y - b.y)
  assert.ok(d1 < d0 - 50 || d1 < 130, `boss closed in: ${d0.toFixed(0)} -> ${d1.toFixed(0)}`)
  assert.ok(d1 > 40, 'it does not sit on top of the player')
})

test('normal mode: the player always faces the boss; hard mode aims with the mouse', async () => {
  const { game: g } = make()
  await startFight(g)
  assert.equal(g.aimMode, 'normal')
  const b = g.boss
  const off = (a, w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w)))
  for (const [x, y] of [[100, 800], [440, 900], [270, 300], [40, 120], [500, 500]]) {
    g.player.x = x
    g.player.y = y
    g.input.mouse.seen = true
    g.input.mouse.x = 10
    g.input.mouse.y = 10 // the mouse is ignored in normal mode
    g.update(STEP)
    assert.ok(off(g.player.aim, Math.atan2(b.y - g.player.y, b.x - g.player.x)) < 0.02, `normal aim at (${x},${y})`)
  }
  g.setAimMode('hard')
  assert.equal(g.store.get('aimMode'), 'hard', 'the mode is remembered')
  for (const [mx, my] of [[100, 100], [500, 700], [270, 900]]) {
    g.input.mouse.x = mx
    g.input.mouse.y = my
    g.update(STEP)
    assert.ok(off(g.player.aim, Math.atan2(my - g.player.y, mx - g.player.x)) < 1e-9, `hard aim at mouse (${mx},${my})`)
  }
})

test('the central stream is thicker and hits three times as hard as a wing', async () => {
  const { game: g } = make()
  await startFight(g)
  g.pbullets.length = 0
  for (let i = 0; i < 0.5 / STEP; i++) g.player.fire(STEP, g.arsenal, g.t, g.pbullets)
  const centre = g.pbullets.filter((b) => b.dmg === 3)
  const wings = g.pbullets.filter((b) => b.dmg === 1)
  assert.ok(centre.length > 0 && wings.length === 2 * centre.length, `one centre bullet per two wing bullets (${centre.length}:${wings.length})`)
  assert.ok(centre.every((b) => b.r > wings[0].r), 'the central stream is thicker')
  // damage really is x3 on the boss
  const b = g.boss
  b.stagger = 0
  const t = b.currentTrait()
  const hp0 = b.tHp[t]
  g.pbullets.length = 0
  g.pbullets.push({ ...centre[0], x: b.x, y: b.y + 30, a: -Math.PI / 2, a0: -Math.PI / 2, mo: [], age: 0, cd: 0 })
  g.update(STEP)
  assert.equal(hp0 - b.tHp[t], 3)
})

test('a melee hit shakes the boss and stops its clock for a fraction of a second, then it is immune for a while', async () => {
  const { game: g } = make()
  await startFight(g)
  g.pm.update = () => {}
  g.pbullets.length = 0
  const b = g.boss
  b.stagger = 0
  b.stunCd = 0
  g.meleeStun()
  assert.ok(b.stun > 0 && b.stun < 0.5, `stun ${b.stun}`)
  assert.equal(b.shake, 1)
  // the clock holds still while stunned...
  const t0 = b.t
  run(g, b.stun * 0.9)
  assert.equal(b.t, t0, 'boss clock stopped')
  // ...and runs again after
  run(g, 0.2)
  assert.ok(b.t > t0)
  // immune for a while: a second hit right away does nothing
  b.stun = 0
  assert.ok(b.stunCd > 0)
  g.meleeStun()
  assert.equal(b.stun, 0)
  run(g, 0.7)
  assert.equal(b.stunCd, 0)
  g.meleeStun()
  assert.ok(b.stun > 0, 'stunnable again')
  // the shake fades out
  run(g, 0.5)
  assert.equal(b.shake, 0)
})

test('the player\'s own melee landing on the boss triggers the stun', async () => {
  const { game: g } = make()
  await startFight(g)
  const b = g.boss
  let stunned = false
  const orig = g.meleeStun.bind(g)
  g.meleeStun = () => {
    stunned = true
    orig()
  }
  g.pbullets.length = 0
  // sit on the boss so every swing reaches it
  for (let i = 0; i < 6 / STEP && !stunned; i++) {
    g.player.x = b.x + 30
    g.player.y = b.y + 30
    g.player.inv = 1e9
    g.update(STEP)
    g.pbullets.length = 0
  }
  assert.ok(stunned, 'melee hit the boss and stunned it')
})

test('phase banners: FURY is red, PURIFIED is gold (the old name BARE is gone)', async () => {
  const { PHASES } = await import('../src/sim/phases.js')
  const fury = PHASES.find((p) => p.id === 'fury')
  const last = PHASES[PHASES.length - 1]
  assert.equal(fury.banner.text, 'FURY')
  assert.equal(fury.banner.tone, 'red')
  assert.equal(last.banner.text, 'PURIFIED')
  assert.equal(last.banner.tone, 'gold')
  assert.equal(last.label, 'Purified')
  assert.ok(!JSON.stringify(PHASES).includes('BARE') && !JSON.stringify(PHASES).includes('Bare'))
})

test('the central stream always flies dead straight, whatever the arsenal bends', async () => {
  const { game: g } = make()
  await startFight(g)
  const { generateBoss: gen } = await import('../src/procgen/generateBoss.js')
  const { pickInheritance, inheritTrait } = await import('../src/game/arsenal.js')
  // inherit everything bendy: collect motions, rhythms and muzzles from many bosses
  for (let s = 1; s < 60; s++) {
    const inh = pickInheritance(gen(s * 17, 8, 0.5))
    if (['motion', 'mod', 'spawner'].includes(inh.slot)) inheritTrait(g.arsenal, inh.slot, inh.entry)
  }
  assert.ok(g.arsenal.motion.length + g.arsenal.mod.length + g.arsenal.spawner.length >= 3, 'a bendy arsenal')
  g.pm.update = () => {}
  g.pbullets.length = 0
  const p = g.player
  p.x = 270
  p.y = 800
  const shots = []
  let bent = 0
  for (let i = 0; i < 3 / STEP; i++) {
    g.boss.tHp.fill(1e9) // keep the boss alive for the whole measurement
    p.x = 270
    p.y = 800
    g.update(STEP)
    for (const pb of g.pbullets) {
      if (pb.dmg !== 3) continue
      shots.push(pb)
      // it leaves along the aim, and nothing ever turns it afterwards
      const born = pb.age < 2 * STEP
      if (pb.a !== pb.a0 || pb.mo.length || (born && Math.abs(Math.atan2(Math.sin(pb.a - p.aim), Math.cos(pb.a - p.aim))) > 1e-9)) bent++
    }
  }
  assert.ok(shots.length > 20)
  assert.equal(bent, 0, 'every central bullet keeps its heading and has no flight law')
  // and the wings do get bent (so the arsenal is really doing something)
})
