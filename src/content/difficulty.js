// The difficulty envelope: slow start, fast ramp, then a PLATEAU that never
// escalates again. After that the challenge is endurance: surviving the same
// brutal difficulty for a long time, not an ever-rising one.
//
//     u(L) = smootherstep(min(1, L / Lp))       (0 at the first boss, 1 from Lp on)
//     v(L) = s + (p − s)·u(L)
//
// s = value at the first boss, p = the plateau value. smootherstep(t) =
// 6t⁵ − 15t⁴ + 10t³ is flat at both ends, so the first bosses stay slow, the
// middle ramps quickly, and from level Lp onward every variable is constant.
export const RAMP_LEVELS = 12 // Lp: the plateau starts at this many wins

export function ramp(level) {
  const t = Math.min(1, Math.max(0, level) / RAMP_LEVELS)
  return t * t * t * (t * (6 * t - 15) + 10)
}

// The plateau is set against a model of human reflexes (see reflex.js): it asks for a
// professional esports player. Warnings shrink to the professional's limit (the
// `teleFloor`: 0.17 s to react + 0.06 s motor + 0.13 s to clear the hazard), bullets get as
// fast as a pro can still answer at close range (BULLET_SPEED_CAP), everything runs faster and
// denser, and the fairness proof itself assumes a pro-speed ship (grid.js: fairFor).
export const VARS = {
  bulletSpeed: { label: 'Bullet speed', s: 0.65, p: 1.9, fmt: 'x' }, // x(150-200) px/s; a pro can answer up to ~385 (see BULLET_SPEED_CAP)
  fireRate: { label: 'Fire rate', s: 0.55, p: 1.8, fmt: 'x' },
  density: { label: 'Bullet density', s: 0.7, p: 1.8, fmt: 'x' },
  flight: { label: 'Flight strength', s: 0.6, p: 1.7, fmt: 'x' },
  rhythm: { label: 'Rhythm speed', s: 0.7, p: 1.6, fmt: 'x' },
  reach: { label: 'Melee reach', s: 0.8, p: 1.25, fmt: 'x' },
  angular: { label: 'Spin and sweep rate', s: 0.6, p: 1.15, fmt: 'x' }, // beams are capped by the proof's sweep bound
  tip: { label: 'Melee tip speed', s: 130, p: 245, fmt: 'px/s' }, // still slower than you can run (300)
  pathSpeed: { label: 'Boss speed', s: 60, p: 140, fmt: 'px/s' },
  uptime: { label: 'Attack uptime', s: 0.65, p: 1.5, fmt: 'x' },
  rest: { label: 'Rest between attacks', s: 1.9, p: 0.4, fmt: 'x' },
  telegraph: { label: 'Warning time', s: 1.5, p: 0.2, fmt: 'x' },
  teleFloor: { label: 'Shortest warning', s: 0.37, p: 0.37, fmt: 's' }, // a pro's limit: nothing is ever announced for less (constant, so warnings only ever shrink)
  // The cycle length of every attack is what the fairness proof sees, so shrinking a warning must
  // not change it: the time taken off the warning is added to the rest (see warning() below).
  teleRef: { label: 'Warning time (cycle)', s: 1.5, p: 0.75, fmt: 'x', hidden: true },
  width: { label: 'Laser width', s: 0.75, p: 1.12, fmt: 'x' },
  lane: { label: 'Safe band of the field', s: 0.74, p: 0.55, fmt: '|f|' },
}

export function difficulty(level) {
  const u = ramp(level)
  const out = {}
  for (const key of Object.keys(VARS)) out[key] = VARS[key].s + (VARS[key].p - VARS[key].s) * u
  return out
}

// The warning before an attack and the rest before it, for a layer whose base warning is `base`
// and base rest `rest0`. The warning shrinks with the difficulty down to the pro floor; the time
// saved goes into the rest, so the attack cycle (what the fairness proof sees) is exactly what
// it would have been with the old, longer warning.
export function timing(d, base, rest0) {
  const ref = base * d.teleRef
  const tele = Math.min(ref, Math.max(d.teleFloor, base * d.telegraph))
  return { tele, rest: rest0 * d.rest + (ref - tele) }
}
