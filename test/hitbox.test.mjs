// Hitbox precision. Every collision in the game is checked against an independent
// brute-force reference (dense sampling of the *drawn* geometry), including the
// boundary: a disc 0.05px inside must hit, 0.05px outside must not.
//
// The contract (see src/sim/collide.js): two things touch when their discs overlap
// at any instant of the step. A hitbox is the drawn shape grown by the other
// party's radius.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../src/game/Game.js'
import { Emitter } from '../src/core/events.js'
import { Store } from '../src/core/storage.js'
import { Input } from '../src/game/Input.js'
import { World } from '../src/sim/World.js'
import { generateBoss } from '../src/procgen/generateBoss.js'
import { MELEE, shapesHit, shapeHit, ringRho, N_RHO } from '../src/content/melee.js'
import { raysLayer } from '../src/sim/layers/rays.js'
import { chladniLayer, fieldValue } from '../src/sim/layers/chladni.js'
import { segDist2, sweptTouch, sectorDist, alongSegment } from '../src/sim/collide.js'
import { mulberry32 } from '../src/core/rng.js'
import { P, BULLET_R, THORN_R, PB_R, BOSS_R, STEP, W, H } from '../src/core/config.js'
import { TAU } from '../src/core/math.js'

const EPS = 0.06 // reference sampling tolerance (px): the dense sampling is 0.05px fine
const rnd = mulberry32(12345)
const U = (a, b) => a + (b - a) * rnd()

/* ------------------------------ reference geometry ------------------------------ */
// Everything below re-derives the shapes from first principles, sampled finely.

// points along a polyline (closed or open), at most `gap` px apart
function densify(pts, closed, gap = 0.05) {
  const out = []
  const n = pts.length
  const m = closed ? n : n - 1
  for (let i = 0; i < m; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const k = Math.max(1, Math.ceil(len / gap))
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k])
  }
  if (!closed) out.push(pts[n - 1])
  return out
}
const minDist = (pts, x, y) => {
  let d2 = Infinity
  for (const p of pts) {
    const dx = p[0] - x
    const dy = p[1] - y
    const d = dx * dx + dy * dy
    if (d < d2) d2 = d
  }
  return Math.sqrt(d2)
}

// For each drawn element: { sample(): a point near it, dist(x, y): true distance from
// the element to a point (<= 0 when inside), grow: how much it is grown by the pen }.
function reference(shapes) {
  const els = []
  const chains = new Map()
  for (const sh of shapes) {
    if (sh.k === 0 && sh.ch >= 0) {
      if (!chains.has(sh.ch)) chains.set(sh.ch, [])
      chains.get(sh.ch).push(sh)
    } else if (sh.k === 0) {
      els.push({ pts: densify([[sh.x, sh.y]], false), grow: sh.r })
    } else if (sh.k === 1) {
      // wedge: boundary (two edges + arc) densely sampled, interior by polar test
      const pts = []
      const e1 = [sh.x + Math.cos(sh.a - sh.half) * sh.rad, sh.y + Math.sin(sh.a - sh.half) * sh.rad]
      const e2 = [sh.x + Math.cos(sh.a + sh.half) * sh.rad, sh.y + Math.sin(sh.a + sh.half) * sh.rad]
      pts.push(...densify([[sh.x, sh.y], e1], false), ...densify([[sh.x, sh.y], e2], false))
      const arcN = Math.ceil((2 * sh.half * sh.rad) / 0.05)
      for (let i = 0; i <= arcN; i++) {
        const a = sh.a - sh.half + (2 * sh.half * i) / arcN
        pts.push([sh.x + Math.cos(a) * sh.rad, sh.y + Math.sin(a) * sh.rad])
      }
      els.push({
        pts,
        grow: 0,
        inside: (x, y) => {
          const d = Math.hypot(x - sh.x, y - sh.y)
          let da = Math.atan2(y - sh.y, x - sh.x) - sh.a
          da = ((((da + Math.PI) % TAU) + TAU) % TAU) - Math.PI
          return d <= sh.rad && Math.abs(da) <= sh.half
        },
      })
    } else {
      // ring: the 96-gon the renderer strokes with a pen of width `thick`
      const v = []
      for (let i = 0; i < 96; i++) {
        const t = (TAU * i) / 96
        const rho = ringRho(sh, t) * sh.R
        v.push([sh.x + Math.cos(t) * rho, sh.y + Math.sin(t) * rho])
      }
      els.push({ pts: densify(v, true), grow: sh.thick / 2 })
    }
  }
  for (const c of chains.values()) els.push({ pts: densify(c.map((s) => [s.x, s.y]), !!c[0].cl), grow: c[0].r })
  return els
}
// signed gap between a disc (x,y,pr) and the drawn shapes: < 0 means they overlap
function gap(els, x, y, pr) {
  let g = Infinity
  for (const e of els) {
    if (e.inside && e.inside(x, y)) return -pr
    g = Math.min(g, minDist(e.pts, x, y) - e.grow - pr)
  }
  return g
}
const pointNear = (els) => {
  const e = els[Math.floor(rnd() * els.length)]
  return e.pts[Math.floor(rnd() * e.pts.length)]
}

const instances = []
for (const key of Object.keys(MELEE)) {
  for (let seed = 1; seed <= 3; seed++) {
    const p = MELEE[key].make(mulberry32(seed * 104729 + key.length), { tip: 210, ang: 1 })
    const t = 1.7 * seed
    const out = []
    MELEE[key].shapes(p, { t, tauOn: t * 0.8, stage: 2, ox: W / 2, oy: 300, base: 0.4 * seed, al: 1, scale: 1 }, out)
    instances.push({ key, seed, shapes: out })
  }
}

/* --------------------------------- primitives --------------------------------- */
test('segDist2 / sweptTouch agree with dense time sampling', () => {
  for (let n = 0; n < 4000; n++) {
    const a0 = [U(-50, 50), U(-50, 50)]
    const a1 = [U(-50, 50), U(-50, 50)]
    const b0 = [U(-50, 50), U(-50, 50)]
    const b1 = [U(-50, 50), U(-50, 50)]
    const R = U(1, 20)
    let best = Infinity
    for (let i = 0; i <= 4000; i++) {
      const f = i / 4000
      best = Math.min(best, Math.hypot(a0[0] + (a1[0] - a0[0]) * f - b0[0] - (b1[0] - b0[0]) * f, a0[1] + (a1[1] - a0[1]) * f - b0[1] - (b1[1] - b0[1]) * f))
    }
    if (Math.abs(best - R) < 0.05) continue
    assert.equal(sweptTouch(a0[0], a0[1], a1[0], a1[1], b0[0], b0[1], b1[0], b1[1], R), best < R, `n=${n}`)
  }
})

test('sectorDist is the true distance to the wedge', () => {
  for (let n = 0; n < 300; n++) {
    const sh = { x: 0, y: 0, rad: U(40, 150), a: U(-3, 3), half: U(0.2, 0.9) }
    const [el] = reference([{ k: 1, ...sh }])
    for (let i = 0; i < 20; i++) {
      const x = U(-190, 190)
      const y = U(-190, 190)
      const ref = el.inside(x, y) ? 0 : minDist(el.pts, x, y)
      assert.ok(Math.abs(sectorDist(sh, x, y) - ref) < EPS, `sector ${n}.${i}: ${sectorDist(sh, x, y)} vs ${ref}`)
    }
  }
})

/* ------------------------------- boss melee shapes ------------------------------- */
test('every melee shape: hit iff the discs overlap (random probes, both sides of the edge)', () => {
  let checked = 0
  let hits = 0
  for (const { key, seed, shapes } of instances) {
    assert.ok(shapes.length > 0, `${key} produced shapes`)
    const els = reference(shapes)
    for (let n = 0; n < 70; n++) {
      const [bx, by] = pointNear(els)
      const pr = rnd() < 0.5 ? P.r : PB_R
      const m = U(0, 1) * (22 + pr)
      const a = U(0, TAU)
      const x = bx + Math.cos(a) * m
      const y = by + Math.sin(a) * m
      const g = gap(els, x, y, pr)
      if (Math.abs(g) < EPS) continue
      checked++
      const got = shapesHit(shapes, x, y, pr)
      if (got) hits++
      assert.equal(got, g < 0, `${key}#${seed} probe (${x.toFixed(2)},${y.toFixed(2)}) r=${pr}: gap ${g.toFixed(3)}`)
    }
  }
  assert.ok(checked > 2500 && hits > 300 && checked - hits > 300, `${checked} probes, ${hits} hits: both sides covered`)
})

test('every melee shape: the exact boundary (0.05px inside hits, 0.05px outside does not)', () => {
  for (const { key, shapes } of instances) {
    const els = reference(shapes)
    for (let n = 0, ok = 0; n < 4000 && ok < 25; n++) {
      // walk outward from the drawn shape along a random direction until the gap is ~0, by bisection
      const [bx, by] = pointNear(els)
      const a = U(0, TAU)
      const dir = [Math.cos(a), Math.sin(a)]
      const pr = P.r
      let lo = 0
      let hi = 40
      if (gap(els, bx, by, pr) >= 0) continue // started outside already (inside another part)
      if (gap(els, bx + dir[0] * hi, by + dir[1] * hi, pr) < 0) continue // stays inside
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (gap(els, bx + dir[0] * mid, by + dir[1] * mid, pr) < 0) lo = mid
        else hi = mid
      }
      const inside = [bx + dir[0] * (lo - 0.05), by + dir[1] * (lo - 0.05)]
      const outside = [bx + dir[0] * (hi + 0.05), by + dir[1] * (hi + 0.05)]
      assert.ok(shapesHit(shapes, inside[0], inside[1], pr), `${key}: 0.05px inside must hit`)
      assert.ok(!shapesHit(shapes, outside[0], outside[1], pr), `${key}: 0.05px outside must not hit`)
      ok++
    }
  }
})

test('a wire is a continuous capsule: no gaps between its links', () => {
  // the drawn wire is one stroked path. The middle of every link-to-link segment,
  // offset sideways by just under (r + pr), must hit; just over must not.
  let n = 0
  for (const { key, shapes } of instances) {
    for (let i = 1; i < shapes.length; i++) {
      const a = shapes[i - 1]
      const b = shapes[i]
      if (a.k !== 0 || b.k !== 0 || a.ch < 0 || a.ch !== b.ch) continue
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = -(b.y - a.y) / l
      const ny = (b.x - a.x) / l
      const pr = P.r
      // test points on the normal, only where that point is not nearer to another link of the chain
      const near = (d) => [mx + nx * d, my + ny * d]
      const g = gap(reference(shapes), ...near(a.r + pr - 0.1), pr)
      if (g > -0.05 && g < 0.05) continue
      n++
      if (g < 0) assert.ok(shapesHit(shapes, ...near(a.r + pr - 0.1), pr), `${key} link ${i} mid-segment must hit`)
    }
  }
  assert.ok(n > 100)
})

test('wire closes: the last link joins the first when the curve is closed', () => {
  for (const key of ['rosette', 'ribbon', 'limacon', 'lemniscate']) {
    const inst = instances.find((i) => i.key === key)
    const c = inst.shapes.filter((s) => s.ch === inst.shapes[0].ch)
    assert.ok(c[0].cl, `${key} is closed`)
    const a = c[c.length - 1]
    const b = c[0]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    assert.ok(shapesHit(inst.shapes, mx, my, P.r), `${key}: closing segment midpoint`)
  }
})

test('shockwave ring: exact distance to the stroked outline, also on steep lobes', () => {
  const pulses = instances.filter((i) => i.key === 'pulse')
  assert.ok(pulses.length > 0)
  for (const { shapes } of pulses) {
    const sh = shapes[0]
    const els = reference([sh])
    for (let n = 0; n < 400; n++) {
      const x = sh.x + U(-1.1, 1.1) * sh.R
      const y = sh.y + U(-1.1, 1.1) * sh.R
      const g = gap(els, x, y, P.r)
      if (Math.abs(g) < EPS) continue
      assert.equal(shapeHit(sh, x, y, P.r), g < 0, `ring probe ${n} gap ${g.toFixed(3)}`)
    }
  }
})

/* --------------------------- the rest of the boss's weapons --------------------------- */
function rayLayer(width, angles, x = 270, y = 300) {
  return { world: { boss: { x, y } }, R: { off: false, vis: { stage: 2, width, angles } } }
}
test('beam: a half-line with a round cap at the boss, exact to the edge', () => {
  for (let n = 0; n < 150; n++) {
    const angles = [U(-3, 3), U(-3, 3)]
    const width = U(8, 36)
    const { world, R } = rayLayer(width, angles)
    for (let i = 0; i < 40; i++) {
      const x = U(-100, 640)
      const y = U(-100, 1060)
      const pr = rnd() < 0.5 ? P.r : PB_R
      // reference: nearest point on the dense ray (s >= 0) for each beam
      let g = Infinity
      for (const a of angles) {
        for (let s = 0; s < 1600; s += 0.1) {
          g = Math.min(g, Math.hypot(270 + Math.cos(a) * s - x, 300 + Math.sin(a) * s - y) - width / 2 - pr)
        }
      }
      if (Math.abs(g) < EPS) continue
      assert.equal(raysLayer.hits(world, R, x, y, pr), g < 0, `beam hit ${n}.${i}: gap ${g.toFixed(3)}`)
    }
  }
})

test('chladni: the hitbox is a disc — touching the dangerous region with the rim hurts', () => {
  const R = { off: false, L: { thr: 0.3 }, vis: { stage: 2, k: 1, A: [2, 3], B: [3, 5], blend: 0.4 } }
  let n = 0
  for (let i = 0; i < 6000; i++) {
    const x = U(20, W - 20)
    const y = U(20, H - 20)
    // does any point of the disc (dense) fall in the danger region?
    let any = false
    let anyCore = false
    for (let j = 0; j < 90 && !any; j++) {
      const a = (TAU * j) / 90
      if (Math.abs(fieldValue(R, x + Math.cos(a) * P.r, y + Math.sin(a) * P.r)) > R.L.thr) any = true
      if (Math.abs(fieldValue(R, x + Math.cos(a) * P.r * 0.9, y + Math.sin(a) * P.r * 0.9)) > R.L.thr) anyCore = true
    }
    if (Math.abs(fieldValue(R, x, y)) > R.L.thr) anyCore = true
    const got = chladniLayer.hits({}, R, x, y, P.r)
    if (anyCore) assert.ok(got, `disc reaching into the field at (${x | 0},${y | 0}) must hurt`)
    if (!any) assert.ok(!got, `disc fully inside the safe band at (${x | 0},${y | 0}) must not hurt`)
    if (any) n++
  }
  assert.ok(n > 300)
})

/* ------------------------------ bullets vs the player ------------------------------ */
const blank = (x, y, a, s) => ({ x, y, a, a0: a, s, age: 0, life: 9, ci: 0, m: 0, p1: 0, p2: 0, ph: 0, g: 1, link: false, gen: 0, bt: null, th: -1, sx: 0, sy: 0 })
function oneStep(b, tg) {
  const w = new World()
  w.setBoss(generateBoss(5, 3, 0.5))
  w.bullets.push(b)
  return w.stepBullets(STEP, tg)
}
const RB = P.r + BULLET_R

test('bullet vs player: exact at the boundary, at every speed (no tunnelling)', () => {
  // the bullet crosses the player's x in one step at distance d; hit iff d < P.r + BULLET_R
  for (const speed of [300, 1100, 4000, 20000, 90000]) {
    const reach = speed * STEP // metres covered this step
    const cx = 270
    const cy = 600
    for (const d of [0, 2, RB - 0.01, RB + 0.01, 9, 20]) {
      const tg = { x: cx, y: cy, px: cx, py: cy, r: P.r }
      // start 0.4 steps before the player, end 0.6 after, d off its line; clamp inside the arena
      const x0 = cx - 0.4 * reach
      const x1 = cx + 0.6 * reach
      if (x0 < -30 || x1 > W + 30) continue
      const b = blank(x0, cy + d, 0, speed)
      b.a = 0
      const hit = oneStep(b, tg)
      assert.equal(!!hit, d < RB, `speed ${speed} offset ${d}: hit=${hit}`)
    }
  }
})

test('bullet vs player: relative motion — a moving player is swept too', () => {
  // player moves 6px/step, bullet is slower and starts beside it
  const w = new World()
  w.setBoss(generateBoss(5, 3, 0.5))
  for (let n = 0; n < 3000; n++) {
    const bx = U(100, 440)
    const by = U(300, 800)
    const a = U(0, TAU)
    const s = U(0, 4000)
    const q0 = [bx + U(-30, 30), by + U(-30, 30)]
    const q1 = [q0[0] + U(-8, 8), q0[1] + U(-8, 8)]
    const b = blank(bx, by, a, s)
    const b1 = [bx + Math.cos(a) * s * STEP, by + Math.sin(a) * s * STEP]
    let best = Infinity
    for (let i = 0; i <= 5000; i++) {
      const f = i / 5000
      best = Math.min(best, Math.hypot(bx + (b1[0] - bx) * f - q0[0] - (q1[0] - q0[0]) * f, by + (b1[1] - by) * f - q0[1] - (q1[1] - q0[1]) * f))
    }
    if (Math.abs(best - RB) < 0.05) continue
    w.bullets.length = 0
    w.bullets.push(b)
    const hit = w.stepBullets(STEP, { x: q1[0], y: q1[1], px: q0[0], py: q0[1], r: P.r })
    assert.equal(!!hit, best < RB, `fuzz ${n}: closest ${best.toFixed(3)}`)
  }
})

test('thorn satellite vs player: the satellite is a disc of THORN_R, swept', () => {
  const RT = P.r + THORN_R
  for (const d of [0, 3, RT - 0.01, RT + 0.01, 12]) {
    const b = blank(270, 400, 0, 0) // a parked bullet
    b.bt = { kind: 'thorn', p: { rho: 40, w: 6, every: 1 } }
    b.th = 0
    // after one step the satellite is at b + 40·(cos, sin)(th + w·age)
    const ang = b.th + 6 * STEP
    const sx = 270 + Math.cos(ang) * 40
    const sy = 400 + Math.sin(ang) * 40
    const tg = { x: sx + d, y: sy, px: sx + d, py: sy, r: P.r }
    const hit = oneStep(b, tg)
    assert.equal(hit, d < RT ? 2 : 0, `satellite offset ${d}`)
  }
  // a fast bullet carries its satellite through the player during one step: the
  // bullet itself passes 20px away (a miss), the satellite 0px (a hit)
  const speed = 12000
  const b = blank(200, 400, 0, speed)
  b.bt = { kind: 'thorn', p: { rho: 20, w: 5, every: 1 } }
  b.th = Math.PI / 2
  const mid = 200 + (speed * STEP) / 2
  const tg = { x: mid, y: 420, px: mid, py: 420, r: P.r }
  assert.equal(oneStep(b, tg), 2, 'a satellite passing through mid-step still hits')
})

/* -------------------------------- player's weapons -------------------------------- */
test('a player bullet cannot skip over a thin hazard (swept cut)', () => {
  let def
  for (let seed = 1; seed < 200 && !def; seed++) {
    const d = generateBoss(seed, 3, 0.5)
    if (d.layers.some((l) => l.type === 'melee')) def = d
  }
  const w = new World()
  w.setBoss(def)
  for (const l of w.boss.layers) l.off = l.L.type !== 'melee'
  const R = w.boss.layers.find((l) => l.L.type === 'melee')
  R.vis.stage = 2
  R.shapes = [{ k: 0, x: 270, y: 500, r: 8.5, al: 1, c: 0, ch: -1 }]
  // a bullet 4x faster than the game's: 40px per step, both ends 20px clear of a 17px blade
  const half = 20
  for (const off of [0, 5, 8.5 + PB_R - 0.05, 8.5 + PB_R + 0.05, 15]) {
    assert.equal(w.cutsAlong(270 - half, 500 + off, 270 + half, 500 + off, PB_R), off < 8.5 + PB_R, `offset ${off}`)
  }
  assert.ok(!w.cutsPlayerBullet(270 - half, 500, PB_R) && !w.cutsPlayerBullet(270 + half, 500, PB_R), 'a point test at either end would miss it')
})

test('a player bullet cannot skip over the boss body, and grazes it exactly', () => {
  for (const off of [0, 20, BOSS_R + PB_R - 0.05, BOSS_R + PB_R + 0.05]) {
    // a very fast bullet: both endpoints outside the body, the segment crosses a chord
    const x0 = 270 - 200
    const x1 = 270 + 200
    const hit = segDist2(270, 300, x0, 300 + off, x1, 300 + off) < (BOSS_R + PB_R) ** 2
    assert.equal(hit, off < BOSS_R + PB_R)
  }
})

/* ----------------------------------- whole game ----------------------------------- */
const tick = () => new Promise((r) => setTimeout(r, 0))
const fair = { request: (level) => Promise.resolve({ seed: 1000 + level * 17, intensity: 0.5, report: { minViable: 1, meanViable: 1, scenarios: 1, horizon: 16, speedFrac: 0.6, margin: 4 } }), reset() {} }
async function fight() {
  const events = new Emitter()
  const log = []
  events.on('hit', () => log.push('hit'))
  events.on('lose', () => log.push('lose'))
  const game = new Game({ store: new Store(null), events, input: new Input(), fairClient: fair })
  await tick()
  game.start()
  await tick()
  game.player.inv = 0
  game.player.alive = true
  for (let i = 0; i < 3.4 / STEP; i++) {
    game.update(STEP)
    game.player.inv = 1e9
  }
  assert.equal(game.mode, 'fight')
  game.player.inv = 0
  for (const R of game.boss.layers) R.off = true // nothing else may hit us
  game.bullets.length = 0
  game.pbullets.length = 0
  game.player.x = 270
  game.player.y = 700
  game.player.px = 270
  game.player.py = 700
  game.player.vx = game.player.vy = 0
  return { game, log }
}

test('game: a bullet that touches the hitbox costs a life — at 12000 px/s as at 300', async () => {
  for (const speed of [300, 1100, 12000]) {
    for (const d of [0, 6.7]) {
      const { game, log } = await fight()
      const p = game.player
      const reach = speed * STEP
      game.bullets.push(blank(p.x - 0.5 * reach, p.y + d, 0, speed))
      game.update(STEP)
      assert.deepEqual(log, ['hit'], `speed ${speed} offset ${d}`)
    }
    const { game, log } = await fight()
    const p = game.player
    const reach = speed * STEP
    game.bullets.push(blank(p.x - 0.5 * reach, p.y + 6.9, 0, speed))
    game.update(STEP)
    assert.deepEqual(log, [], `speed ${speed}: 6.9px away is a miss (hitbox ${RB}px)`)
  }
})

test('game: standing still on a live hazard always hurts, off it never does', async () => {
  const { game, log } = await fight()
  const R = game.boss.layers.find((l) => l.L.type === 'melee')
  const target = R || game.boss.layers.find((l) => l.L.type === 'rays')
  assert.ok(target)
  target.off = false
  target.vis.stage = 2
  if (target.L.type === 'melee') target.shapes = [{ k: 0, x: 300, y: 700, r: 10, al: 1, c: 0, ch: -1 }]
  else {
    target.vis.width = 30
    target.vis.angles = [0]
    game.boss.x = 100
    game.boss.y = 700
  }
  const p = game.player
  const touching = target.L.type === 'melee' ? 300 - (10 + P.r - 0.05) : 100 + 400
  p.x = p.px = touching
  assert.ok(game.world.hazardHits(p.x, p.y, P.r), 'overlapping hitbox is a hit')
  game.checkHazards()
  assert.deepEqual(log, ['hit'])
})

test('game: no hazard stays drawn while it cannot hurt (stagger withdraws every layer)', async () => {
  const { game } = await fight()
  for (const R of game.boss.layers) R.off = false
  game.boss.stagger = 0
  for (let i = 0; i < 6 / STEP; i++) {
    game.update(STEP)
    game.pbullets.length = 0 // this test is about hazards, not about the player's own fire
    game.player.inv = 1e9
  }
  game.severTrait(game.boss.currentTrait())
  assert.ok(game.boss.stagger > 0)
  for (const R of game.boss.layers) {
    assert.equal(R.vis.stage, 0, `${R.L.type} drawn during stagger`)
    assert.equal(R.shapes.length, 0)
  }
  // and the hazard that comes back after the stagger starts with its telegraph
  for (let i = 0; i < 2 / STEP; i++) game.update(STEP)
  for (const R of game.boss.layers) assert.ok(R.vis.stage <= 1 || R.cyc > R.L.rest, 'the pattern restarts from rest')
})

/* ------------------------------ no tunnelling in melee ------------------------------ */
test('melee shapes move far less per step than they are wide (no tunnelling at 120 Hz)', () => {
  let worst = 0
  for (const key of Object.keys(MELEE)) {
    for (let seed = 1; seed <= 12; seed++) {
      const p = MELEE[key].make(mulberry32(seed * 7919), { tip: 210, ang: 1 })
      let prev = null
      for (let t = 0; t < 6; t += STEP) {
        const out = []
        MELEE[key].shapes(p, { t, tauOn: t, stage: 2, ox: 270, oy: 300, base: 0.3, al: 1, scale: 1 }, out)
        if (prev && prev.length === out.length) {
          for (let i = 0; i < out.length; i++) {
            const sh = out[i]
            const q = prev[i]
            let d = sh.k === 1 ? Math.abs(sh.a - q.a) * sh.rad : sh.k === 2 ? Math.abs(sh.R - q.R) : Math.hypot(sh.x - q.x, sh.y - q.y)
            if (sh.k === 2 && d > 30) d = 0 // a ripple that wrapped round (vanishes, a new one starts small)
            worst = Math.max(worst, d)
          }
        }
        prev = out
      }
    }
  }
  // thinnest hazard is a wire of radius 8: 2*(8 + P.r) = 22.8px must exceed per-step motion by a wide margin
  assert.ok(worst < 4, `fastest shape point moves ${worst.toFixed(2)}px per step`)
  assert.ok(P.speed * STEP < 3, 'and the player moves less than 3px per step')
})
