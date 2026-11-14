import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { verifyBoss, botRun, scenariosFor } from '../src/fairness/verify.js'
import { PHASES } from '../src/sim/phases.js'
import { World } from '../src/sim/World.js'

test('proof is sound: a bot following the viability kernel is never hit (all phases)', { timeout: 300000 }, () => {
  let total = 0
  for (const L of [0, 5, 12]) {
    for (const s of [2, 6]) {
      const def = generateBoss(s * 23 + L, L, 0.5)
      for (const sc of scenariosFor(def)) {
        const r = botRun(def, sc)
        if (r.hits === -1) continue
        total++
        assert.equal(r.hits, 0, `level ${L} seed ${s} removed [${sc.removed}] ${JSON.stringify(r.firstHit)}`)
      }
    }
  }
  assert.ok(total > 10)
})

test('scenarios cover the real removal order including the fury state', () => {
  const def = generateBoss(77, 5, 1)
  const sc = scenariosFor(def)
  const w = new World()
  let fury = 0
  for (const s of sc) {
    const b = w.setBoss(def)
    for (const id of s.removed) {
      if (b.gone[id]) continue
      b.removeTrait(def.traits[id])
      b.gone[id] = true
      b.left--
    }
    b.advancePhase()
    if (b.phase.id === 'fury') fury++
  }
  assert.ok(fury >= 1, 'the last-trait state is tested at fury tempo')
  assert.equal(PHASES[1].pace.near, 2.8)
})

test('verifyBoss reports the scenario count', () => {
  const r = verifyBoss(generateBoss(3, 0, 0.5))
  assert.ok(r.minViable > 0 && r.scenarios >= 2)
})
