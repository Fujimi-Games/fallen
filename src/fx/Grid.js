// Geometry Wars style spring grid. Interior points are pulled home and
// toward the average of their neighbours, which makes ripples travel.
export class Grid {
  constructor(W, H, cols = 28, rows = 50) {
    this.W = W
    this.H = H
    this.cols = cols
    this.rows = rows
    const n = cols * rows
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.hx = new Float32Array(n)
    this.hy = new Float32Array(n)
    this.sx = W / (cols - 1)
    this.sy = H / (rows - 1)
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        this.hx[k] = this.x[k] = i * this.sx
        this.hy[k] = this.y[k] = j * this.sy
      }
    }
  }

  update(dt) {
    const { cols, rows, x, y, vx, vy, hx, hy } = this
    const kh = 26
    const kn = 700
    const damp = Math.exp(-3.2 * dt)
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i
        const ax = (x[k - 1] + x[k + 1] + x[k - cols] + x[k + cols]) * 0.25 - x[k]
        const ay = (y[k - 1] + y[k + 1] + y[k - cols] + y[k + cols]) * 0.25 - y[k]
        vx[k] = (vx[k] + (ax * kn + (hx[k] - x[k]) * kh) * dt) * damp
        vy[k] = (vy[k] + (ay * kn + (hy[k] - y[k]) * kh) * dt) * damp
      }
    }
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i
        x[k] += vx[k] * dt
        y[k] += vy[k] * dt
      }
    }
  }

  // Radial impulse. strength > 0 pushes away, < 0 pulls in. (px/s)
  push(cx, cy, rad, strength) {
    const { cols, rows, x, y, vx, vy, sx, sy } = this
    const i0 = Math.max(1, Math.floor((cx - rad) / sx))
    const i1 = Math.min(cols - 2, Math.ceil((cx + rad) / sx))
    const j0 = Math.max(1, Math.floor((cy - rad) / sy))
    const j1 = Math.min(rows - 2, Math.ceil((cy + rad) / sy))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * cols + i
        const dx = x[k] - cx
        const dy = y[k] - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d >= rad || d < 0.001) continue
        const q = 1 - d / rad
        const fo = strength * q * q
        vx[k] += (dx / d) * fo
        vy[k] += (dy / d) * fo
      }
    }
  }

  // draws with a theme (ink(alpha) -> CSS colour): hairlines, brighter where disturbed
  draw(ctx, theme) {
    const { cols, rows, x, y, hx, hy } = this
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        if (i < cols - 1) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k + 1], y[k + 1])
        }
        if (j < rows - 1) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k + cols], y[k + cols])
        }
      }
    }
    ctx.strokeStyle = theme.ink(0.075)
    ctx.stroke()

    // disturbed segments glow brighter
    ctx.beginPath()
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i
        const dx = x[k] - hx[k]
        const dy = y[k] - hy[k]
        if (dx * dx + dy * dy < 5) continue
        if (i < cols - 1) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k + 1], y[k + 1])
        }
        if (j < rows - 1) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k + cols], y[k + cols])
        }
        if (i > 0) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k - 1], y[k - 1])
        }
        if (j > 0) {
          ctx.moveTo(x[k], y[k])
          ctx.lineTo(x[k - cols], y[k - cols])
        }
      }
    }
    ctx.strokeStyle = theme.ink(0.4)
    ctx.stroke()
  }
}
