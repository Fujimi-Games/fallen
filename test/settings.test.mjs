// Rebindable controls: bindings are data, edited by the Settings panel, read by Input, remembered.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, defaults, rebind, actionOf, loadBindings, saveBindings, keyLabel } from '../src/game/bindings.js'
import { Input } from '../src/game/Input.js'
import { Store } from '../src/core/storage.js'
import { Game } from '../src/game/Game.js'

test('defaults are WASD, Shift, Esc, R, M, H and every action has a distinct key', () => {
  const d = defaults()
  assert.deepEqual([d.up, d.left, d.down, d.right, d.focus, d.pause], ['w', 'a', 's', 'd', 'shift', 'escape'])
  assert.equal(new Set(Object.values(d)).size, ACTIONS.length)
})

test('rebinding swaps with the action that had the key, and refuses reserved keys', () => {
  const d = defaults()
  const r = rebind(d, 'up', 'i')
  assert.equal(r.bindings.up, 'i')
  assert.equal(r.swapped, null)
  const s = rebind(r.bindings, 'down', 'i') // 'i' is up's now: they swap
  assert.equal(s.bindings.down, 'i')
  assert.equal(s.bindings.up, 's')
  assert.equal(s.swapped, 'up')
  assert.equal(new Set(Object.values(s.bindings)).size, ACTIONS.length, 'still one key per action')
  assert.equal(rebind(d, 'up', 'tab'), null)
})

test('Input follows the bindings: new keys move the ship, old ones do not; arrows always work', () => {
  const inp = new Input()
  inp.setBindings(rebind(defaults(), 'up', 'i').bindings)
  inp.keys.add('i')
  assert.deepEqual(inp.axis(), { x: 0, y: -1 })
  inp.keys.clear()
  inp.keys.add('w') // the old key is now 'w' for nothing... except it moved to nothing: 'i' took up, w is free
  assert.deepEqual(inp.axis(), { x: 0, y: 0 })
  inp.keys.clear()
  inp.keys.add('arrowup')
  assert.deepEqual(inp.axis(), { x: 0, y: -1 })
  inp.keys.clear()
  inp.keys.add('shift')
  assert.ok(inp.down('focus'))
  assert.equal(actionOf(inp.bindings, 'i'), 'up')
  assert.equal(actionOf(inp.bindings, 'p'), 'pause')
})

test('bindings are remembered; a damaged save falls back to the defaults', () => {
  const store = new Store(null)
  const b = rebind(defaults(), 'focus', 'z').bindings
  saveBindings(store, b)
  assert.deepEqual(loadBindings(store), b)
  store.set('controls', { up: 's' }) // 's' is also down's default: one key would do two things
  assert.deepEqual(loadBindings(store), defaults())
  store.set('controls', 'nonsense')
  assert.deepEqual(loadBindings(store), defaults())
})

test('the game uses them: a rebound pause key pauses', async () => {
  const store = new Store(null)
  saveBindings(store, rebind(defaults(), 'pause', 'x').bindings)
  const g = new Game({ store, fairClient: { request: () => new Promise(() => {}), reset() {} } })
  g.mode = 'fight' // pausing needs a run
  g.onKey('x')
  assert.equal(g.paused, true)
  g.onKey('p') // P is always an alias of pause
  assert.equal(g.paused, false)
  g.onKey('escape') // no longer bound
  assert.equal(g.paused, false)
  assert.equal(keyLabel('escape'), 'Esc')
})
