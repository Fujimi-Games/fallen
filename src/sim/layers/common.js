import { angDiff } from '../../core/math.js'
import { W, H } from '../../core/config.js'

// rest -> tele -> on -> fade. Returns [stage, progress 0..1].
export function stageOf(L, tau) {
  if (tau < L.rest) return [0, 0]
  tau -= L.rest
  if (tau < L.tele) return [1, tau / L.tele]
  tau -= L.tele
  if (tau < L.on) return [2, tau / L.on]
  tau -= L.on
  return [3, tau / L.fade]
}

// Beams and blades aim at the player (the arena centre when there is none, as in
// the fairness proof) from wherever the boss is. The aim is
// rate-limited so the sweep speed stays bounded (the fairness proof needs it).
export function trackAim(R, world, dt) {
  const boss = world.boss
  const t = world.pursue && world.target ? world.target : { x: W / 2, y: H * 0.55 }
  const want = Math.atan2(t.y - boss.y, t.x - boss.x)
  if (R.aim === undefined) R.aim = want
  else R.aim += Math.max(-0.25 * dt, Math.min(0.25 * dt, angDiff(R.aim, want)))
}
