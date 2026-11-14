import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { emitterPigments } from '../src/content/pigments.js'

test('every boss gets a palette from its traits: valid colours, a colour per trait, bullets out of the rust band', () => {
  const hues = new Set()
  for (let level = 0; level < 16; level += 3) {
    for (let seed = 1; seed <= 40; seed++) {
      const def = generateBoss(seed * 31 + level, level, 1)
      assert.ok(def.palette.length >= def.layers.length * 2 - 1)
      for (const c of def.palette) {
        assert.ok(c.h >= 0 && c.h < 360 && c.s >= 16 && c.s <= 36 && c.l >= 52 && c.l <= 66, JSON.stringify(c))
      }
      for (const t of def.traits) assert.ok(t.color && Number.isFinite(t.color.h), `trait ${t.kind} has a colour`)
      for (const L of def.layers) {
        if (L.type !== 'emitter') continue
        for (const c of emitterPigments(L)) assert.ok(c.h > 26 && c.h < 352, `bullet hue ${c.h} out of the rust band`)
        assert.ok(L.hue < def.palette.length && L.hue2 < def.palette.length, 'bullet colour slots exist')
        hues.add(def.palette[L.hue].h)
      }
    }
  }
  assert.ok(hues.size > 40, 'colours vary widely between bosses')
})

test('the same trait parameters give the same colour; different parameters give a different one', () => {
  const a = generateBoss(5, 8, 1)
  const b = generateBoss(5, 8, 1)
  assert.deepEqual(a.palette, b.palette)
  const c = generateBoss(6, 8, 1)
  assert.notDeepEqual(a.palette, c.palette)
})
