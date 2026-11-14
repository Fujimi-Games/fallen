// The top difficulty (the plateau, from 12 wins on) asks for a professional esports player:
// warnings at a pro's limit, bullets as fast as a pro can answer, a proof that assumes a pro-speed
// ship, and everything denser and quicker. It must also stay humanly possible.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { difficulty, timing, VARS, RAMP_LEVELS } from '../src/content/difficulty.js'
import { HUMAN, MOTOR, teleNeeded, tierOfTele, tierOfBulletSpeed, reactionAllowed, reflexOf, BULLET_SPEED_CAP } from '../src/content/reflex.js'
import { fairFor, FAIR } from '../src/fairness/grid.js'
import { World } from '../src/sim/World.js'
import { STEP, P } from '../src/core/config.js'

const topSpeed = (def, seconds = 25) => {
  const w = new World()
  w.setBoss(def)
  let top = 0
  for (let k = 0; k < seconds / STEP; k++) {
    w.moveBoss(STEP)
    w.runAttacks(STEP)
    w.stepBullets(STEP, null)
    for (const b of w.bullets) if (b.s > top) top = b.s
  }
  return top
}
const layersWithTele = (def) => def.layers.filter((l) => l.tele !== undefined)

test('the human model: tiers are ordered and each warning maps to the slowest reaction that survives it', () => {
  assert.ok(HUMAN.average.react > HUMAN.gamer.react && HUMAN.gamer.react > HUMAN.pro.react && HUMAN.pro.react > HUMAN.limit.react)
  assert.ok(teleNeeded(HUMAN.pro.react) < teleNeeded(HUMAN.gamer.react))
  assert.equal(tierOfTele(teleNeeded(HUMAN.average.react) + 0.01), 'average')
  assert.equal(tierOfTele(teleNeeded(HUMAN.gamer.react) + 0.01), 'gamer')
  assert.equal(tierOfTele(teleNeeded(HUMAN.pro.react) + 0.005), 'pro')
  assert.equal(tierOfTele(teleNeeded(HUMAN.limit.react) - 0.02), 'impossible')
  // a pro with 0.17s reaction is just inside a warning of teleNeeded(pro)
  assert.ok(Math.abs(reactionAllowed(teleNeeded(HUMAN.pro.react)) - HUMAN.pro.react) < 1e-9)
  assert.ok(MOTOR > 0 && P.speed > 0)
})

test('plateau warnings sit at the professional limit: possible for a pro, impossible by reaction for everyone else', () => {
  for (const level of [RAMP_LEVELS, RAMP_LEVELS + 3, 40]) {
    for (let s = 1; s <= 8; s++) {
      const def = generateBoss(s * 313 + level, level, 0.5)
      for (const L of layersWithTele(def)) {
        assert.equal(tierOfTele(L.tele), 'pro', `${L.type} warning ${L.tele.toFixed(3)}s`)
        assert.ok(reactionAllowed(L.tele) >= HUMAN.pro.react - 1e-9, 'a pro can still answer it')
        assert.ok(reactionAllowed(L.tele) < HUMAN.gamer.react, 'a keen gamer cannot answer it by reaction alone')
      }
      assert.equal(reflexOf(def).teleTier, 'pro')
    }
  }
})

test('the first bosses are for anyone: warnings an average player can answer', () => {
  for (let s = 1; s <= 8; s++) {
    const def = generateBoss(s * 313, 0, 0.5)
    for (const L of layersWithTele(def)) assert.equal(tierOfTele(L.tele), 'average', `${L.type} warning ${L.tele.toFixed(2)}s`)
  }
})

test('warnings shrink with the level, but the attack cycle (what the proof sees) does not change with them', () => {
  const d = (l) => difficulty(l)
  const prev = { 1.5: Infinity, 0.9: Infinity, 1.8: Infinity }
  for (let level = 0; level <= RAMP_LEVELS; level++) {
    const def = generateBoss(77, level, 0.5)
    for (const base of [1.5, 0.9, 1.8]) {
      const tele = timing(d(level), base, 1).tele
      assert.ok(tele <= prev[base] + 1e-9, `warning (base ${base}) shrinks: level ${level}`)
      prev[base] = tele
    }
    // cycle = rest + tele + on + fade; tele and rest trade exactly, so it equals the long-warning cycle
    for (const L of layersWithTele(def)) {
      const base = L.type === 'rays' ? [1.5, 1.0] : L.type === 'melee' ? [0.9, 0.8] : [1.8, 2.0]
      const sameCycleRest = base[1] * d(level).rest + base[0] * d(level).teleRef - L.tele
      assert.ok(Math.abs(L.rest - sameCycleRest) < 1e-9, `${L.type} level ${level}: the time saved is added to the rest`)
    }
  }
})

test('plateau bullets are as fast as a pro can answer and never faster; early ones are slow', () => {
  assert.equal(tierOfBulletSpeed(BULLET_SPEED_CAP), 'pro')
  assert.ok(tierOfBulletSpeed(BULLET_SPEED_CAP + 60) !== 'pro')
  let top = 0
  for (let s = 1; s <= 6; s++) {
    const v = topSpeed(generateBoss(s * 733, RAMP_LEVELS + 2, 0.5))
    assert.ok(v <= BULLET_SPEED_CAP + 1e-6, `no bullet beyond the cap: ${v.toFixed(0)} vs ${BULLET_SPEED_CAP}`)
    top = Math.max(top, v)
  }
  assert.ok(top > BULLET_SPEED_CAP * 0.8, `the fastest plateau bullets sit near the cap: ${top.toFixed(0)}`)
  const early = topSpeed(generateBoss(733, 0, 0.5))
  assert.ok(early < 0.5 * BULLET_SPEED_CAP && tierOfBulletSpeed(early) === 'average', `first boss top speed ${early.toFixed(0)}`)
})

test('the proof assumes a pro-speed ship at the plateau and an ordinary one at the start', () => {
  assert.equal(fairFor(0).speedFrac, FAIR.speedFrac)
  assert.equal(fairFor(RAMP_LEVELS).speedFrac, FAIR.proSpeedFrac)
  assert.equal(fairFor(60).speedFrac, FAIR.proSpeedFrac)
  let prev = 0
  for (let l = 0; l <= RAMP_LEVELS; l++) {
    const s = fairFor(l).speedFrac
    assert.ok(s >= prev)
    prev = s
  }
  assert.ok(fairFor(RAMP_LEVELS).DT < fairFor(0).DT, 'a faster ship crosses a cell sooner')
})

test('from the plateau on, every difficulty variable is constant and at its hardest', () => {
  for (const key of Object.keys(VARS)) {
    assert.ok(Math.abs(difficulty(RAMP_LEVELS)[key] - VARS[key].p) < 1e-9, key)
    assert.ok(Math.abs(difficulty(RAMP_LEVELS + 20)[key] - VARS[key].p) < 1e-9, key)
  }
  assert.ok(Math.abs(difficulty(RAMP_LEVELS).teleFloor - 0.37) < 1e-9 && tierOfTele(0.37) === 'pro')
})
