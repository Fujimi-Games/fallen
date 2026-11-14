// What the player inherits from fallen bosses. Traits stack in four slots (up to
// CAP each; a new one pushes out the oldest) and MERGE by simple rules:
//   muzzle (spawners)  angle offsets and sideways offsets ADD
//   flight (motions)   each law adds its own heading offset (curl adds turn rate)
//   rhythm (mods)      rotation/morph ADD, spread/rate/speed MULTIPLY
//   melee              every inherited shape is live at once (union), on top of
//                      the base slash
// A hit strips one random inherited trait; with none left it costs a stream, and
// the player dies when no trait of any kind remains.
// The same equation never stacks: inheriting one you already hold keeps the
// better parameters (the larger value of each strength parameter).
import { SPAWNERS } from '../content/spawners.js'
import { MOTIONS, MOTION_CODE } from '../content/motions.js'
import { MODS } from '../content/mods.js'
import { MELEE } from '../content/melee.js'
import { traitPigment, meleePigment } from '../content/pigments.js'
import { BULLET_TRAITS } from '../content/bullets.js'

const KEY = 'fallen.arsenal.v2'
const OLD_KEY = 'fallen.arsenal.v1'
export const CAP = 3
export const SLOTS = ['spawner', 'motion', 'mod', 'shot', 'melee']
const TABLES = { spawner: SPAWNERS, motion: MOTIONS, mod: MODS, shot: BULLET_TRAITS, melee: MELEE }
export const SLOT_LABEL = { spawner: 'muzzle', motion: 'flight', mod: 'rhythm', shot: 'shot', melee: 'melee' }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

export const emptyArsenal = () => ({ spawner: [], motion: [], mod: [], shot: [], melee: [], hue: 185 })

function sanitize(j) {
  const a = emptyArsenal()
  for (const slot of SLOTS) {
    const v = j[slot]
    const list = Array.isArray(v) ? v : v ? [v] : []
    a[slot] = list.filter((e) => e && TABLES[slot][e.key]).slice(-CAP)
  }
  if (typeof j.hue === 'number') a.hue = j.hue
  return a
}

export function loadArsenal(store) {
  const j = store.get(KEY) || store.get(OLD_KEY)
  return j ? sanitize(j) : emptyArsenal()
}

export function saveArsenal(store, a) {
  store.set(KEY, a)
}

export const countInherited = (a) => SLOTS.reduce((n, s) => n + a[s].length, 0)

// Parameters that make an equation stronger, per kind (larger |value| = better).
const BETTER = {
  snake: ['A', 'w'],
  curl: ['w'],
  flow: ['k'],
  spin: ['w'],
  pendulum: ['A', 'w'],
  pulse: ['a', 'w'],
  drift: ['w'],
  fission: ['n', 'spread'],
  thorn: ['rho', 'w'],
  phyllotaxis: ['skew'],
  rose: ['k'],
  superformula: ['m'],
  lissajous: ['A'],
  spirograph: ['rad'],
}

// A melee trait's strength: how many things it swings times how far they reach.
function meleeScore(key, p) {
  const count = { blades: p.n, sweep: p.count, pulse: p.rings, rosette: p.k, spiral: p.arms, ribbon: p.sym }[key] || 1
  const reach = p.R || p.rad || p.Rmax || 80
  return count * reach
}

// Returns {kind: 'new' | 'upgrade' | 'kept', changed?}
export function inheritTrait(a, slot, entry) {
  const list = a[slot]
  const i = list.findIndex((e) => e.key === entry.key)
  if (i < 0) {
    list.push(entry)
    if (list.length > CAP) list.shift()
    a.hue = entry.hue
    return { kind: 'new' }
  }
  const old = list[i]
  if (slot === 'melee') {
    if (meleeScore(entry.key, entry.p) > meleeScore(old.key, old.p)) {
      list[i] = entry
      a.hue = entry.hue
      return { kind: 'upgrade', changed: ['shape'] }
    }
    return { kind: 'kept' }
  }
  const changed = []
  const p = { ...old.p }
  for (const k of BETTER[entry.key] || TABLES[slot][entry.key].better || []) {
    if (Math.abs(entry.p[k]) > Math.abs(old.p[k])) {
      p[k] = entry.p[k]
      changed.push(k)
    }
  }
  if (!changed.length) return { kind: 'kept' }
  old.p = p
  old.tex = TABLES[slot][entry.key].tex(p)
  old.from = entry.from
  old.hue = entry.hue
  a.hue = entry.hue
  return { kind: 'upgrade', changed }
}

// Remove one random inherited trait. Returns {slot, entry} or null.
export function removeRandom(a) {
  const all = []
  for (const s of SLOTS) a[s].forEach((e, i) => all.push([s, i]))
  if (!all.length) return null
  const [slot, i] = all[Math.floor(Math.random() * all.length)]
  const [entry] = a[slot].splice(i, 1)
  return { slot, entry }
}

// Pick one random trait from the boss's layers.
export function pickInheritance(def) {
  const c = []
  for (const L of def.layers) {
    if (L.type === 'melee') c.push({ slot: 'melee', key: L.melee, p: L.mp, hue: meleePigment(L).h })
    if (L.type !== 'emitter') continue
    const hueOf = (kind) => traitPigment({ kind }, L).h
    c.push({ slot: 'spawner', key: L.spawner, p: L.p, bt: L.bt, bthue: L.bt ? hueOf(L.bt.kind) : 0, hue: hueOf('spawner') })
    if (L.bt) c.push({ slot: 'shot', key: L.bt.kind, p: L.bt.p, hue: hueOf(L.bt.kind) })
    if (L.motion) c.push({ slot: 'motion', key: L.motion, p: L.mp, hue: hueOf('motion') })
    if (L.mod) c.push({ slot: 'mod', key: L.mod, p: L.modP, hue: hueOf('mod') })
  }
  const pick = c[Math.floor(Math.random() * c.length)]
  const make = (slot, key, p, hue) => {
    const T = TABLES[slot][key]
    return { key, p, name: slot === 'motion' ? T.adj : T.name, tex: T.tex(p), from: def.name, hue }
  }
  const out = { slot: pick.slot, entry: make(pick.slot, pick.key, pick.p, pick.hue) }
  // a spawner is a macro trait: its bullet trait (fission / thorn) comes with it
  if (pick.bt) out.also = { slot: 'shot', entry: make('shot', pick.bt.kind, pick.bt.p, pick.bthue) }
  return out
}

// The player's bullet traits as {fission: params | null, thorn: params | null}.
export function shotDescs(ar) {
  const out = { fission: null, thorn: null }
  for (const e of ar.shot) out[e.key] = e.p
  return out
}

// Rhythm: how the gun breathes. Merges every rhythm trait into {rot, spread, rate, spd, morph}.
export function modulate(ar, t, out) {
  out.rot = 0
  out.spread = 1
  out.rate = 1
  out.spd = 1
  out.morph = 0
  for (const m of ar.mod) {
    const p = m.p
    switch (m.key) {
      case 'spin':
        out.spread *= 1 + (0.35 + 0.8 * Math.abs(p.w)) * Math.sin(Math.abs(p.w) * 3 * t)
        break
      case 'pendulum':
        out.rot += 0.16 * p.A * Math.sin(p.w * 2 * t)
        break
      case 'pulse':
        out.rate *= 1 + 0.3 * Math.sin(p.w * t)
        out.spd *= 1 + p.a * Math.sin(p.w * t)
        break
      default:
        out.morph += (0.5 + 1.5 * p.w) * Math.sin(p.w * 2 * t)
    }
  }
  out.spread = clamp(out.spread, 0.4, 2)
  out.rate = clamp(out.rate, 0.5, 1.8)
  out.spd = clamp(out.spd, 0.6, 1.6)
  out.morph = clamp(out.morph, -1.6, 1.6)
  return out
}

// Muzzle: per-shot angle offset `da` and sideways offset `lat` (px), summed over
// every inherited spawner.
export function muzzle(ar, n, t, morph, out) {
  out.da = 0
  out.lat = 0
  const cone = 1 + 0.6 * morph
  for (const s of ar.spawner) {
    const p = s.p
    const hook = SPAWNERS[s.key].muzzle
    if (hook) {
      hook(p, n, t, cone, out)
      continue
    }
    switch (s.key) {
      case 'phyllotaxis':
        out.da += (((n * 0.6180339887) % 1) - 0.5) * (0.34 * (p.skew / 0.018)) * cone
        break
      case 'rose':
        out.da += 0.04 * p.k * Math.cos(p.k * n * 0.23) * cone
        break
      case 'superformula': {
        const x = (p.m * n * 0.37) / 4
        const r = Math.pow(Math.pow(Math.abs(Math.cos(x)), p.n) + Math.pow(Math.abs(Math.sin(x)), p.n), -1 / Math.max(0.25, p.n1))
        out.da += 0.03 * p.m * Math.tanh(1.5 * (r - 1)) * cone
        break
      }
      case 'lissajous': {
        const u = t * p.w * 2
        out.lat += 0.16 * p.A * Math.sin(p.a * u + p.d) * cone
        break
      }
      default: {
        const u = t * p.w * 2
        const q = p.k - 1
        out.lat += ((0.16 * p.rad * (q * Math.cos(u) + p.dd * Math.cos(q * u))) / (q + p.dd)) * cone
      }
    }
  }
  out.da = clamp(out.da, -0.55, 0.55)
  out.lat = clamp(out.lat, -30, 30)
  return out
}

// Flight: the list of inherited motion laws a fresh player bullet carries. The
// bullet adds them all (see Game.updatePBullets). `side` is -1/0/+1.
export function motionDescs(ar, n, side) {
  const out = []
  for (const mo of ar.motion) {
    const code = MOTION_CODE[mo.key]
    if (code === 1) out.push({ m: 1, p1: Math.min(mo.p.A, 1) * 0.2, p2: mo.p.w, ph: n * mo.p.spread })
    else if (code === 2) out.push({ m: 2, p1: mo.p.w * 0.9 * (side || 1), p2: 0, ph: 0 })
    else if (code === 3) out.push({ m: 3, p1: 0.32 * mo.p.k, p2: 0, ph: 0 })
  }
  return out
}
