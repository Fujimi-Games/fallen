import test from 'node:test'
import assert from 'node:assert/strict'
import { pickEnsemble, LEAD, BASS, MOD_VOICE, MOTION_VOICE } from '../src/audio/ensemble.js'
import { INSTRUMENTS, INSTRUMENT_NAMES } from '../src/audio/instruments.js'
import { generateBoss } from '../src/procgen/generateBoss.js'

test('every instrument an ensemble can choose exists in the registry', () => {
  const all = new Set([...Object.values(LEAD).flat(), ...Object.values(BASS).flat(), ...Object.values(MOD_VOICE).flat(), ...Object.values(MOTION_VOICE).flat()])
  for (const n of all) assert.ok(INSTRUMENTS[n], `missing instrument ${n}`)
  assert.ok(INSTRUMENT_NAMES.length >= 10)
})

test('ensembles are deterministic per boss, varied across bosses, and leads do not repeat within a boss', () => {
  const used = new Set()
  for (let s = 1; s <= 80; s++) {
    const def = generateBoss(s * 17, (s % 10) + 3, 1)
    const a = pickEnsemble(def)
    assert.deepEqual(a, pickEnsemble(def))
    const leads = Object.values(a.lead)
    for (const n of leads) used.add(n)
    for (const L of def.layers) if (L.type === 'emitter') assert.ok(a.lead[L.index], 'every emitter has a lead')
    if (leads.length > 1) assert.notEqual(leads[0], leads[1])
    used.add('bass:' + a.bass)
  }
  assert.ok([...used].filter((n) => !n.startsWith('bass:')).length >= 7, 'many different leads appear')
  assert.ok([...used].filter((n) => n.startsWith('bass:')).length >= 3, 'several different basses appear')
})
