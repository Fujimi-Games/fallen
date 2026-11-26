import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../src/game/Game.js'
import { Emitter } from '../src/core/events.js'
import { Store } from '../src/core/storage.js'
import { Input } from '../src/game/Input.js'
import { STEP } from '../src/core/config.js'
import { createPlatform } from '../src/platform/danboru.js'
import { EVENTS, ACHIEVEMENTS, RESOURCES, AVATARS } from '../metaru/catalogue.mjs'

const tick = () => new Promise((r) => setTimeout(r, 0))
const fair = { request: (level) => Promise.resolve({ seed: 2000 + level * 13, intensity: 0.5, report: { minViable: 1, meanViable: 1, scenarios: 1, horizon: 16, speedFrac: 0.6, margin: 4 } }), reset() {} }

test('without the public Danboru values the platform is a no-op and the game plays', async () => {
  const p = createPlatform({})
  assert.equal(p.state.enabled, false)
  const events = new Emitter()
  const game = new Game({ store: new Store(null), events, input: new Input(), fairClient: fair })
  const off = p.attach(game, events)
  await tick()
  game.start()
  await tick()
  assert.equal(game.mode, 'intro')
  off()
  p.destroy()
})

test('the game emits what the Danboru events are built from: run, win, inherit, abandon', async () => {
  const events = new Emitter()
  const seen = []
  for (const n of ['run', 'win', 'inherit', 'abandon', 'sever', 'lose']) events.on(n, (x) => seen.push([n, x]))
  const g = new Game({ store: new Store(null), events, input: new Input(), fairClient: fair })
  await tick()
  g.start()
  await tick()
  g.player.inv = 1e9
  for (let i = 0; i < 3.2 / STEP; i++) g.update(STEP)
  assert.equal(g.mode, 'fight')
  for (let i = 0; i < 20000 && g.mode === 'fight'; i++) {
    g.damageBoss({ x: g.boss.x, y: g.boss.y + 60, a: 0 }, 1)
    if (g.boss.stagger > 0) g.update(STEP) // the stagger after a sever or phase change must pass
  }
  assert.equal(g.mode, 'won')
  const names = seen.map(([n]) => n)
  assert.equal(names[0], 'run')
  assert.ok(names.includes('sever'))
  assert.ok(names.indexOf('win') < names.indexOf('inherit'))
  const inh = seen.find(([n]) => n === 'inherit')[1]
  assert.ok(['spawner', 'motion', 'mod', 'shot', 'melee'].includes(inh.slot))
  assert.ok(['new', 'upgrade', 'kept'].includes(inh.kind))
  assert.equal(g.run.bosses, 1) // boss_defeated reads bosses_in_run after the win
  g.restartRun()
  assert.equal(seen.filter(([n]) => n === 'abandon').length, 1)
})

test('the catalogue: every achievement rule reads a declared event and property; keys are unique', () => {
  const ev = new Map(EVENTS.map((e) => [e.key, e]))
  for (const a of ACHIEVEMENTS) {
    const e = ev.get(a.rule.event)
    assert.ok(e, `${a.key}: ${a.rule.event} is declared`)
    for (const c of a.rule.where || []) assert.ok(c.property in e.properties, `${a.key}: ${c.property}`)
    if (a.rule.property) assert.ok(a.rule.property in e.properties)
  }
  assert.ok(ACHIEVEMENTS.reduce((n, a) => n + a.points, 0) <= 1000)
  for (const list of [RESOURCES, ACHIEVEMENTS, AVATARS]) assert.equal(new Set(list.map((x) => x.key)).size, list.length)
  assert.equal(new Set(RESOURCES.map((r) => r.display_name)).size, RESOURCES.length, 'resource names are distinct')
})
