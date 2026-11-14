// Turns live hazards into blocked cells, one marker per layer type. A new attack
// type needs a marker here that inflates it by hitbox + margin + cell + sweep.
import { ringRho } from '../content/melee.js'
import { angDiff, TAU } from '../core/math.js'
import { W, H, STEP, BULLET_R, THORN_R, P } from '../core/config.js'
import { CELL, X0, Y0, COLS, ROWS, PC, N, BASE_R, HALF_DIAG, CU, CV, stampDisc } from './grid.js'

// marks are taken every max(1, floor(2/tempo)) steps; above tempo 2 they are further
// apart than the inflation constants assume, so the sweep terms scale with it
const sweep = (boss) => Math.max(1, (boss.tempo * Math.max(1, Math.floor(2 / boss.tempo))) / 2)

export function markBullets(world, B, off) {
  const arr = world.bullets
  for (let n = 0; n < arr.length; n++) {
    const b = arr[n]
    // half of the distance travelled between two marks (marks are 2*STEP apart)
    stampDisc(B, off, b.x, b.y, BASE_R + b.s * STEP)
    // a thorn satellite has its own radius and also circles the bullet at rho*omega
    if (b.th >= 0 && b.bt) stampDisc(B, off, b.sx, b.sy, BASE_R - BULLET_R + THORN_R + (b.s + b.bt.p.rho * Math.abs(b.bt.p.w)) * STEP)
  }
}

export function markRays(world, R, B, off) {
  const boss = world.boss
  if (R.vis.stage !== 2 || !(R.vis.width > 1)) return
  for (const a of R.vis.angles) {
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let d = 0; d < 1300; d += 4) {
      const x = boss.x + c * d
      const y = boss.y + s * d
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) {
        if (d > 100) break
        continue
      }
      // 0.014*d covers the angular sweep (<= 0.84 rad/s) during one mark
      stampDisc(B, off, x, y, R.vis.width / 2 + BASE_R + 0.014 * d * sweep(boss))
    }
  }
}

// Melee zones are inflated by the same hitbox + margin + cell diagonal, plus 4px
// for how far a blade/scythe edge moves between two marks.
function stampSector(B, off, sh, infl) {
  const reach = sh.rad + infl
  const i0 = Math.max(0, Math.ceil((sh.x - reach - X0) / CELL))
  const i1 = Math.min(COLS - 1, Math.floor((sh.x + reach - X0) / CELL))
  const j0 = Math.max(0, Math.ceil((sh.y - reach - Y0) / CELL))
  const j1 = Math.min(ROWS - 1, Math.floor((sh.y + reach - Y0) / CELL))
  for (let j = j0; j <= j1; j++) {
    const dy = Y0 + j * CELL - sh.y
    const row = off + (j + 1) * PC + 1
    for (let i = i0; i <= i1; i++) {
      const dx = X0 + i * CELL - sh.x
      const d = Math.hypot(dx, dy)
      if (d > reach) continue
      if (d <= infl || Math.abs(angDiff(sh.a, Math.atan2(dy, dx))) <= sh.half + Math.asin(Math.min(1, infl / d)) + 0.0125) B[row + i] = 1
    }
  }
}

function stampRing(B, off, sh, infl) {
  const S = 96
  for (let i = 0; i < S; i++) {
    const th = (TAU * i) / S
    const rho = ringRho(sh, th)
    // + 6: half the gap between neighbouring samples at the largest radius
    stampDisc(B, off, sh.x + Math.cos(th) * rho * sh.R, sh.y + Math.sin(th) * rho * sh.R, sh.thick / 2 + infl + 6)
  }
}

export function markMelee(world, R, B, off) {
  if (R.vis.stage !== 2) return
  const infl = BASE_R + 4 * sweep(world.boss)
  for (const sh of R.shapes) {
    if (sh.k === 0) stampDisc(B, off, sh.x, sh.y, sh.r + infl)
    else if (sh.k === 1) stampSector(B, off, sh, infl)
    else stampRing(B, off, sh, infl)
  }
}

// Field mask for one Chladni layer at the current instant. Returns null if the
// field is not dangerous right now.
export function fieldMask(world, R) {
  if (R.vis.stage !== 2 || !(R.vis.k > 0.04)) return null
  const { A, B, blend } = R.vis
  // Shrink the safe band by the most the field can change between a cell centre and
  // any point the player may occupy while assigned to it (half a cell diagonal):
  //   |∇f| <= π(n+m)·hypot(1/W, 1/H)   for f = cos nπu cos mπv − cos mπu cos nπv
  const sum = Math.max(A[0] + A[1], blend ? B[0] + B[1] : 0)
  const thr = R.L.thr - Math.PI * sum * Math.hypot(1 / W, 1 / H) * (HALF_DIAG + P.r)
  const m = new Uint8Array(N)
  for (let j = 0; j < ROWS; j++) {
    const row = (j + 1) * PC + 1
    for (let i = 0; i < COLS; i++) {
      let f = CU[A[0]][i] * CV[A[1]][j] - CU[A[1]][i] * CV[A[0]][j]
      if (blend) {
        const g = CU[B[0]][i] * CV[B[1]][j] - CU[B[1]][i] * CV[B[0]][j]
        f = f * (1 - blend) + g * blend
      }
      if (Math.abs(f) > thr) m[row + i] = 1
    }
  }
  return m
}

// Per layer type: marks the layer's live hazard into B at offset off.
// `every` (marks per step) is handled by the caller; the inflation constants assume
// marks are 2*STEP of boss-clock time apart.
export const MARKERS = {
  rays: markRays,
  melee: markMelee,
}
