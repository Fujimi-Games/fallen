// Weak spots: small bodies that orbit the boss on a parametric path (the orbit is a trait of
// the boss, shown in its dossier). Each stage (each trait in turn) has its own set of at least
// three, different in size and in durability; a fresh set respawns whenever a new trait
// becomes the one taking damage.
//
// Shooting a spot wears it down; when it breaks, the current trait loses a bounty at once.
// Balance is unchanged from the single weak spot it replaces: the spots share the same total
// durability (hpFrac of the trait's) and the same total bounty (`bounty` of the trait's), split
// in the same proportions, so per point of durability the reward is identical. In units of
// H = the trait's durability, D = your damage per second into the body:
//   body only             T = H / D
//   spots, aim fraction f T = hpFrac·H/(f·D) + (1 − bounty)·H/D
//   perfect aim           T = (1 − bounty + hpFrac)·H/D        -> 32% faster at 0.40 / 0.08
//   break-even            f = hpFrac / bounty                  -> 20%: below that, ignore them
import { mulberry32, range, pick } from '../core/rng.js'
import { PATHS, buildPath, evalPath } from './paths.js'
import { GOLDEN, TAU } from '../core/math.js'

export const WEAK = {
  count: [3, 5], // spots per stage (inclusive)
  radius: [4, 10], // px: the bracket the sizes are drawn from
  share: [0.6, 1.4], // relative durability weight, normalised so the total is exact
  hpFrac: 0.08, // of the trait's durability, in total
  bounty: 0.4, // of the trait's durability, in total
  reach: [68, 96], // px: how far from the boss the orbit reaches
  speed: 85, // px/s: the fastest a spot moves
  spawn: 0.5, // seconds a respawned spot takes to grow to full size
  curves: ['lissajous', 'spirograph', 'limacon', 'rose'],
}

// The weak spots of a boss: one orbit trait, and a set of spots for every stage (trait).
export function makeWeakSpots(seed, traits) {
  const r = mulberry32(((seed >>> 0) ^ 0x5bd1e995) >>> 0)
  const kind = pick(r, WEAK.curves)
  const reach = range(r, WEAK.reach[0], WEAK.reach[1])
  const path = buildPath(kind, PATHS[kind].make(r), r() * TAU, reach, reach, WEAK.speed, 0.6)
  const stages = traits.map((t) => {
    const n = WEAK.count[0] + Math.floor(r() * (WEAK.count[1] - WEAK.count[0] + 1))
    const w = Array.from({ length: n }, () => range(r, WEAK.share[0], WEAK.share[1]))
    const sum = w.reduce((a, b) => a + b, 0)
    // sizes: one per stratum of the bracket (kept off the stratum edges), shuffled, so no two are alike
    const radii = Array.from({ length: n }, (_, k) => WEAK.radius[0] + ((WEAK.radius[1] - WEAK.radius[0]) * (k + 0.15 + 0.7 * r())) / n)
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1))
      ;[radii[k], radii[j]] = [radii[j], radii[k]]
    }
    return w.map((x, k) => ({
      r: +radii[k].toFixed(1),
      hp: Math.max(1, Math.round((WEAK.hpFrac * t.hp * x) / sum)),
      bounty: Math.max(1, Math.round((WEAK.bounty * t.hp * x) / sum)),
      off: (k + r() * 0.6) * GOLDEN / path.w, // where on the curve it starts
    }))
  })
  return {
    kind,
    path,
    reach: Math.round(reach),
    name: `Orbit · ${PATHS[kind].name}`,
    tex: `${PATHS[kind].tex(path.p)} · reach ${Math.round(reach)}px · peak ${Math.round(path.peak)} px/s`,
    stages,
  }
}

// position (relative to the boss) of a spot on the orbit at boss clock t
export function spotOffset(weak, spot, t) {
  const [u, v] = evalPath(weak.path, t + spot.off)
  return [u * weak.reach, v * weak.reach]
}
