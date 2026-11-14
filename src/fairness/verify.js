// Mathematical fairness: a boss ships only with a proof that it is survivable.
//
// Model. The arena is discretised into CELL-pixel cells. A player with speed
// v_eff = speedFrac * v_max (a deliberately weakened player) can move to any of
// its 8 neighbours in one step of length DT = CELL*sqrt(2)/v_eff, so the move
// set is a subset of what the real player can do (never optimistic).
//
// For each scenario (trait-removal state, clock offset, layer cycle offsets) the boss is
// simulated headless and the blocked set B_k is built for every step k. A cell
// is blocked if a hit would be possible anywhere inside it at any moment of the
// step: hazards are inflated by hitbox radius + safety margin + half a cell
// diagonal + the distance swept during the step. So B_k is a superset of the
// true danger set (sound, never optimistic).
//
// The viability kernel is computed backwards in time:
//     V_K = free_K,   V_k = free_k ∩ dilate(V_{k+1})
// V_k is exactly the set of positions at step k from which a zero-damage path
// exists to the end of the horizon. The boss is fair iff the viable fraction
//     |V_k| / |arena|
// stays above a threshold for every step of every scenario. min_k |V_k| > 0 is
// existence of a safe path; the threshold adds robustness (recovery from
// mistakes: a random position is survivable with that probability).
import { generateBoss } from '../procgen/generateBoss.js'
import { ramp } from '../content/difficulty.js'
import { World } from '../sim/World.js'
import { SPAWNER_DEPENDENTS } from '../sim/traits.js'
import { W, H, P, STEP } from '../core/config.js'
import { FAIR, fairFor, CELL, X0, Y0, COLS, ROWS, PC, N, CELLS, idx } from './grid.js'
import { markBullets, MARKERS, fieldMask } from './marks.js'

export { FAIR }

// Builds the world for one scenario: boss at clock t0, layer cycles offset, and
// the traits in `removed` already stripped (the phase follows from what is left).
function setupWorld(def, sc) {
  const world = new World()
  const boss = world.setBoss(def)
  boss.t = sc.t0
  for (const R of boss.layers) R.cyc = sc.cyc[R.L.index] || 0
  world.moveBoss(0)
  for (const id of sc.removed) {
    if (boss.gone[id]) continue
    boss.removeTrait(def.traits[id])
    boss.gone[id] = true
    boss.left--
  }
  boss.advancePhase()
  return world
}

function buildBlocked(def, sc) {
  const { DT, K } = fairFor(def.level)
  const world = setupWorld(def, sc)
  const boss = world.boss

  const B = new Uint8Array((K + 1) * N)
  const prevField = new Map()
  let simT = 0
  for (let k = 1; k <= K; k++) {
    const off = k * N
    const target = k * DT
    let sub = 0
    while (simT < target - 1e-9) {
      world.moveBoss(STEP)
      world.runAttacks(STEP)
      world.stepBullets(STEP, null)
      simT += STEP
      sub++
      // marks must be 2*STEP of *boss-clock* time apart: at tempo x2 that is every step
      if (sub % Math.max(1, Math.floor(2 / boss.tempo)) === 0 || simT >= target - 1e-9) {
        markBullets(world, B, off)
        for (const R of boss.layers) {
          if (!R.off) MARKERS[R.L.type]?.(world, R, B, off)
        }
      }
    }
    // fields change slowly: union of the field at both ends of the step
    for (const R of boss.layers) {
      if (R.L.type !== 'chladni' || R.off) continue
      const cur = fieldMask(world, R)
      const prev = prevField.get(R)
      for (const m of [cur, prev]) {
        if (!m) continue
        for (let c = 0; c < N; c++) if (m[c]) B[off + c] = 1
      }
      prevField.set(R, cur)
    }
  }
  return B
}

// Backward viability kernel. Returns viable fraction per step.
function viability(B, fp, keep = null) {
  const { K } = fp
  let next = new Uint8Array(N)
  let cur = new Uint8Array(N)
  const frac = new Float32Array(K + 1)
  const blockedFrac = new Float32Array(K + 1)
  for (let j = 0; j < ROWS; j++) {
    const row = (j + 1) * PC + 1
    for (let i = 0; i < COLS; i++) next[row + i] = B[K * N + row + i] ? 0 : 1
  }
  for (let k = K; k >= 1; k--) {
    if (k < K) {
      const off = k * N
      for (let j = 0; j < ROWS; j++) {
        const row = (j + 1) * PC + 1
        for (let i = 0; i < COLS; i++) {
          const c = row + i
          // both endpoints of a move must be free of the interval's hazards, because
          // a hit can happen anywhere along the segment (nearest endpoint <= half a step)
          cur[c] = B[off + c] || B[off + N + c]
            ? 0
            : next[c - PC - 1] | next[c - PC] | next[c - PC + 1] | next[c - 1] | next[c] | next[c + 1] | next[c + PC - 1] | next[c + PC] | next[c + PC + 1]
        }
      }
      const t = next
      next = cur
      cur = t
    }
    let v = 0
    let bl = 0
    const off = k * N
    for (let j = 0; j < ROWS; j++) {
      const row = (j + 1) * PC + 1
      for (let i = 0; i < COLS; i++) {
        v += next[row + i]
        bl += B[off + row + i]
      }
    }
    frac[k] = v / CELLS
    blockedFrac[k] = bl / CELLS
    if (keep) keep[k] = next.slice()
  }
  return { frac, blockedFrac }
}

// The player wears traits down in a fixed order (the order of def.traits: ranged,
// then movement, then melee last; severing a spawner takes its rhythm and flight
// laws with it), so the states a fight can reach are exactly the prefixes of that
// sequence: full strength, then after each severance, up to the last trait. The
// guarantee per state is exact. The phase (and its tempo) follows from the state.
function legalStates(def) {
  const n = def.traits.length
  const gone = new Set()
  const states = [[]]
  while (gone.size < n) {
    const i = def.traits.findIndex((t, j) => !gone.has(j))
    gone.add(i)
    if (def.traits[i].kind === 'spawner') {
      def.traits.forEach((t, j) => {
        if (t.layer === def.traits[i].layer && SPAWNER_DEPENDENTS.includes(t.kind)) gone.add(j)
      })
    }
    if (gone.size < n) states.push([...gone])
  }
  return states
}

function scenariosFor(def) {
  const cycFor = (k, j) => {
    const c = {}
    def.layers.forEach((L, i) => {
      if (L.T) c[i] = ((k * 0.37 + j * 0.53 + i * 0.21) % 1) * L.T
    })
    return c
  }
  const out = []
  legalStates(def).forEach((removed, k) => {
    out.push({ removed, t0: 3 + ((k * 13.7 + 5) % 38), cyc: cycFor(k, 0) })
    if (k === 0) out.push({ removed, t0: 3 + 23.3, cyc: cycFor(0, 1) })
  })
  return out
}

export function verifyBoss(def) {
  const fp = fairFor(def.level)
  const { DT, K } = fp
  const scen = scenariosFor(def)
  const last = K - Math.ceil(FAIR.tail / DT) // ignore the horizon tail (optimistic edge)
  let minV = 1
  let sumV = 0
  let cnt = 0
  let peakBlocked = 0
  let worst = null
  for (const sc of scen) {
    const B = buildBlocked(def, sc)
    const { frac, blockedFrac } = viability(B, fp)
    let sMin = 1
    for (let k = 1; k <= last; k++) {
      if (frac[k] < sMin) sMin = frac[k]
      sumV += frac[k]
      cnt++
      if (blockedFrac[k] > peakBlocked) peakBlocked = blockedFrac[k]
    }
    if (sMin < minV) {
      minV = sMin
      worst = { removed: sc.removed.length, t0: sc.t0 }
    }
  }
  return {
    minViable: minV,
    meanViable: sumV / cnt,
    peakBlocked,
    scenarios: scen.length,
    horizon: FAIR.horizon,
    speedFrac: +fp.speedFrac.toFixed(2),
    margin: FAIR.margin,
    worst,
  }
}

// Required viable fractions follow the same ramp as the difficulty, then
// plateau with it: early bosses must leave a lot of room, plateau bosses may
// squeeze it hard, and nothing tightens beyond that.
//   min  = 0.50 + (0.08 − 0.50)·u(L)        mean = 0.78 + (0.35 − 0.78)·u(L)
export function thresholds(level) {
  const u = ramp(level)
  return { min: 0.5 + (0.08 - 0.5) * u, mean: 0.78 + (0.35 - 0.78) * u }
}

const passes = (rep, need) => rep.minViable >= need.min && rep.meanViable >= need.mean

// Search for a boss that satisfies the proof. A seed is first tested at the
// gentlest density (0.5x); if even that fails the seed is discarded. Otherwise
// the highest density in the ladder that still passes is kept.
export function findFairBoss(level, rand = Math.random, maxTries = 16, ladder = [1, 0.72]) {
  const need = thresholds(level)
  let best = null
  for (let n = 0; n < maxTries; n++) {
    const seed = (rand() * 2147483647) | 0
    const floor = verifyBoss(generateBoss(seed, level, 0.5))
    if (!best || floor.minViable > best.report.minViable) best = { seed, intensity: 0.5, report: floor, ok: false }
    if (!passes(floor, need)) continue
    let pick = { seed, intensity: 0.5, report: floor, ok: true }
    for (const it of ladder) {
      const rep = verifyBoss(generateBoss(seed, level, it))
      if (passes(rep, need)) {
        pick = { seed, intensity: it, report: rep, ok: true }
        break
      }
    }
    return { ...pick, tries: n + 1 }
  }
  return { ...best, tries: maxTries, forced: true }
}


// ---------------------------------------------------------------------------
// End-to-end soundness check: a bot that follows the viability kernel through a
// fresh simulation, judged by the game's own (un-inflated) hit tests. If the
// proof is sound the bot never gets hit. Returns the number of hits.
export function botRun(def, sc, naive = false) {
  const fp = fairFor(def.level)
  const { DT, K } = fp
  const B = buildBlocked(def, sc)
  const V = []
  viability(B, fp, V)
  // start: viable cell at step 1 closest to the usual spawn point
  let ci = -1
  let cj = -1
  let bd = Infinity
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (!V[1][idx(i, j)]) continue
      const d = Math.hypot(X0 + i * CELL - W / 2, Y0 + j * CELL - (H - 170))
      if (d < bd) {
        bd = d
        ci = i
        cj = j
      }
    }
  }
  if (ci < 0) return { hits: -1, steps: 0 } // no viable start at all
  const world = setupWorld(def, sc)
  const boss = world.boss
  let px = X0 + ci * CELL
  let py = Y0 + cj * CELL
  let hits = 0
  let firstHit = null
  let simT = 0
  const last = K - Math.ceil(FAIR.tail / DT)
  for (let k = 1; k <= last; k++) {
    // choose next cell: stay if still viable, else any viable neighbour
    let ni = ci
    let nj = cj
    if (!naive && !V[k + 1][idx(ci, cj)]) {
      let found = false
      for (let dj = -1; dj <= 1 && !found; dj++) {
        for (let di = -1; di <= 1 && !found; di++) {
          const i = ci + di
          const j = cj + dj
          if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue
          if (V[k + 1][idx(i, j)]) {
            ni = i
            nj = j
            found = true
          }
        }
      }
      if (!found) return { hits: -2, steps: k } // kernel contradiction
    }
    const sx = px
    const sy = py
    const tx = X0 + ni * CELL
    const ty = Y0 + nj * CELL
    const target = k * DT
    const t0 = simT
    while (simT < target - 1e-9) {
      world.moveBoss(STEP)
      world.runAttacks(STEP)
      simT += STEP
      const f = Math.min(1, (simT - t0) / (target - t0))
      const qx = px
      const qy = py
      px = sx + (tx - sx) * f
      py = sy + (ty - sy) * f
      // the game's own hit tests: swept bullets and satellites, then the live hazards
      const hb = world.stepBullets(STEP, { x: px, y: py, px: qx, py: qy, r: P.r })
      let hit = hb > 0
      let why = hb === 1 ? 'bullet' : hb === 2 ? 'thorn' : ''
      if (!hit) {
        const hz = world.hazardAt(px, py, P.r)
        if (hz) {
          hit = true
          why = hz.L.type
        }
      }
      if (hit) {
        hits++
        if (!firstHit) firstHit = { k, why, t: +(simT).toFixed(2), px: Math.round(px), py: Math.round(py) }
      }
    }
    ci = ni
    cj = nj
  }
  return { hits, steps: last, firstHit }
}

export { scenariosFor }
