// The discretised arena shared by the fairness proof: constants, indexing and the
// Chladni lookup tables.
import { W, H, P, BULLET_R } from '../core/config.js'
import { ramp } from '../content/difficulty.js'

// speedFrac is the weakened player the proof assumes. It RISES with the difficulty: the first
// bosses are proven against a player at 60% of full speed (anyone), and from the plateau on
// against one at proSpeedFrac (a professional, who uses nearly all of the ship's speed).
export const FAIR = { speedFrac: 0.6, proSpeedFrac: 0.85, margin: 4, cell: 8, horizon: 16, tail: 1.5 }

export const CELL = FAIR.cell
export const X0 = 16
export const Y0 = 16
export const COLS = Math.floor((W - 32) / CELL) + 1
export const ROWS = Math.floor((H - 32) / CELL) + 1
export const PC = COLS + 2
export const PR = ROWS + 2
export const N = PC * PR
export const CELLS = COLS * ROWS
// the step of the proof for a boss at `level`: the player's assumed speed, the time to cross a
// cell diagonally (DT) and how many steps the horizon is (K)
export function fairFor(level) {
  const speedFrac = FAIR.speedFrac + (FAIR.proSpeedFrac - FAIR.speedFrac) * ramp(level)
  const VEFF = speedFrac * P.speed
  const DT = (CELL * Math.SQRT2) / VEFF
  return { speedFrac, VEFF, DT, K: Math.ceil(FAIR.horizon / DT) }
}
export const HALF_DIAG = CELL * Math.SQRT1_2
export const BASE_R = BULLET_R + P.r + FAIR.margin + HALF_DIAG

export const idx = (i, j) => (j + 1) * PC + i + 1

// cos(n*pi*u_i) and cos(m*pi*v_j) tables for the Chladni field
export const CU = []
export const CV = []
for (let n = 0; n <= 6; n++) {
  CU[n] = new Float32Array(COLS)
  CV[n] = new Float32Array(ROWS)
  for (let i = 0; i < COLS; i++) CU[n][i] = Math.cos(n * Math.PI * ((X0 + i * CELL) / W))
  for (let j = 0; j < ROWS; j++) CV[n][j] = Math.cos(n * Math.PI * ((Y0 + j * CELL) / H))
}

export function stampDisc(B, off, x, y, r) {
  const i0 = Math.max(0, Math.ceil((x - r - X0) / CELL))
  const i1 = Math.min(COLS - 1, Math.floor((x + r - X0) / CELL))
  if (i0 > i1) return
  const j0 = Math.max(0, Math.ceil((y - r - Y0) / CELL))
  const j1 = Math.min(ROWS - 1, Math.floor((y + r - Y0) / CELL))
  const r2 = r * r
  for (let j = j0; j <= j1; j++) {
    const dy = Y0 + j * CELL - y
    const row = off + (j + 1) * PC + 1
    for (let i = i0; i <= i1; i++) {
      const dx = X0 + i * CELL - x
      if (dx * dx + dy * dy <= r2) B[row + i] = 1
    }
  }
}
