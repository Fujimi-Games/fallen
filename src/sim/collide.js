// Exact collision primitives. Pure functions, no state, no DOM.
//
// THE CONTRACT (one rule for everything that can hurt or be hurt):
//   Two things touch when the distance between their outlines is below zero, i.e.
//   when their discs overlap. A hitbox is therefore always "the drawn shape,
//   grown by the other party's radius", and a thing that moves is tested along its
//   whole path for the step, never only at the end of it (no tunnelling).
//
//   disc  vs disc     centre distance < r1 + r2
//   wire  (a polyline drawn with a round pen) = capsule chain, not a row of beads
//   sector (scythe)   exact distance to the filled wedge
//   ring  (shockwave) exact distance to the drawn closed polyline
//   beam              exact distance to the capsule/half-line (see layers/rays.js)

import { TAU } from '../core/math.js'

// squared distance from a point to the segment a→b
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + t * dx - px
  const qy = ay + t * dy - py
  return qx * qx + qy * qy
}

// Did two moving discs overlap at any instant of one step? Both move in a straight
// line at constant speed during the step, so their separation moves in a straight
// line too: the discs overlapped iff that line passes within R = r1 + r2.
export function sweptTouch(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, R) {
  return segDist2(0, 0, ax0 - bx0, ay0 - by0, ax1 - bx1, ay1 - by1) < R * R
}

// Exact distance from a point to the wedge (apex x,y; reach rad; heading a; half-angle half).
export function sectorDist(sh, px, py) {
  const dx = px - sh.x
  const dy = py - sh.y
  const d = Math.hypot(dx, dy)
  let da = Math.atan2(dy, dx) - sh.a
  da = ((((da + Math.PI) % TAU) + TAU) % TAU) - Math.PI
  const inside = Math.abs(da) <= sh.half
  if (inside) return d <= sh.rad ? 0 : d - sh.rad
  const x1 = sh.x + Math.cos(sh.a - sh.half) * sh.rad
  const y1 = sh.y + Math.sin(sh.a - sh.half) * sh.rad
  const x2 = sh.x + Math.cos(sh.a + sh.half) * sh.rad
  const y2 = sh.y + Math.sin(sh.a + sh.half) * sh.rad
  return Math.sqrt(Math.min(segDist2(px, py, sh.x, sh.y, x1, y1), segDist2(px, py, sh.x, sh.y, x2, y2)))
}

// Distance from a point to a closed polyline stored as [x0,y0,x1,y1,...].
export function polyDist2(poly, px, py) {
  const n = poly.length
  let best = Infinity
  let ax = poly[n - 2]
  let ay = poly[n - 1]
  for (let i = 0; i < n; i += 2) {
    const bx = poly[i]
    const by = poly[i + 1]
    const d = segDist2(px, py, ax, ay, bx, by)
    if (d < best) best = d
    ax = bx
    ay = by
  }
  return best
}

// Sample a straight move at most `gap` px apart (inclusive of the end point, not the start).
// Used to test something that is carried through a field of shapes (a player bullet
// against melee). Calls fn(x, y); stops and returns true as soon as fn does.
export function alongSegment(x0, y0, x1, y1, gap, fn) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.max(1, Math.ceil(len / gap))
  for (let i = 1; i <= n; i++) {
    const f = i / n
    if (fn(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return true
  }
  return false
}
