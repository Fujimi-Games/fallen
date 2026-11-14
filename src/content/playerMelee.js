// The player's melee: same shapes as the bosses', scaled down and centred on the player.
import { MELEE, CURVE_WIRES } from './melee.js'

// The player's own swings: same shapes, short-lived, centred on the player.
// kind 'slash' is the default; inherited melee traits replace it.
export const PLAYER_MELEE = {
  slash: { dur: 0.2, cd: 0.35, dmg: 14, rad: 84 },
  sweep: { dur: 0.55, cd: 0.7, dmg: 16, rad: 92 },
  blades: { dur: 1.3, cd: 1.6, dmg: 2, rad: 62 },
  pulse: { dur: 0.6, cd: 0.9, dmg: 14, rad: 125 },
  rosette: { dur: 1.3, cd: 1.5, dmg: 3, rad: 66 },
  spiral: { dur: 1.3, cd: 1.5, dmg: 3, rad: 66 },
  ribbon: { dur: 1.3, cd: 1.5, dmg: 3, rad: 66 },
}
for (const k of CURVE_WIRES) PLAYER_MELEE[k] = { dur: 1.3, cd: 1.5, dmg: 3, rad: 66 }

export function playerShapes(kind, p, t, px, py, aim, out) {
  const M = PLAYER_MELEE[kind]
  const u = Math.min(1, t / M.dur)
  const al = u > 0.7 ? Math.max(0, (1 - u) / 0.3) : 1
  out.length = 0
  if (kind === 'slash') {
    out.push({ k: 1, x: px, y: py, rad: M.rad * (0.6 + 0.4 * Math.min(1, t / 0.06)), a: aim, half: 0.95, al, c: 0, ch: -1 })
  } else if (kind === 'sweep') {
    const a = aim - 1.25 + 2.5 * (u * u * (3 - 2 * u)) + 0.2 * Math.sin(p.f2 * t * 3)
    out.push({ k: 1, x: px, y: py, rad: M.rad, a, half: 0.5, al, c: 0, ch: -1 })
  } else if (kind === 'pulse') {
    const e = 1 - Math.pow(1 - u, 2)
    out.push({ k: 2, x: px, y: py, R: Math.max(6, M.rad * e), rho: p.rho, thick: 16, rot: p.rotRate * t, al, c: 0, ch: -1 })
  } else {
    // wires and blades: the boss's own shape function, scaled down to the player
    const scale = M.rad / (p.R || 100)
    MELEE[kind].shapes(p, { t: t * (kind === 'blades' ? 2.4 : 1.4), ox: px, oy: py, base: aim, al, stage: 2, tauOn: t, scale }, out)
    if (kind === 'blades') for (const s of out) s.r = 13
  }
  return out
}

// ---- merged player swing -------------------------------------------------
// The base slash is always part of the swing; every inherited melee trait adds
// its own shapes, all live at the same time. Each part keeps its own timing; the
// swing ends when the longest part ends.
export function swingParts(ar) {
  const parts = [{ kind: 'slash', p: null }]
  for (const e of ar.melee) parts.push({ kind: e.key, p: e.p })
  return parts
}
export const swingDur = (parts) => Math.max(...parts.map((x) => PLAYER_MELEE[x.kind].dur))
export const swingCycle = (parts) => Math.max(...parts.map((x) => PLAYER_MELEE[x.kind].dur + PLAYER_MELEE[x.kind].cd))

// Writes the union of all parts' shapes at local time t. Each shape is tagged with
// its part (src) and index within it (idx) so damage cooldowns can be tracked.
const partBuf = []
export function swingShapes(parts, t, px, py, aim, out) {
  out.length = 0
  for (let i = 0; i < parts.length; i++) {
    const M = PLAYER_MELEE[parts[i].kind]
    if (t >= M.dur) continue
    playerShapes(parts[i].kind, parts[i].p, t, px, py, aim, partBuf)
    for (let j = 0; j < partBuf.length; j++) {
      partBuf[j].src = i
      partBuf[j].idx = j
      out.push(partBuf[j])
    }
  }
  return out
}
