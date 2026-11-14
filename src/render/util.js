import { TAU } from '../core/math.js'

export const GHOSTS = [0.05, 0.1, 0.15, 0.2] // afterimage delays (s)

// polygon through pts, rotated by rot, scaled by sc, centred on (x, y)
export function poly(ctx, pts, x, y, rot, sc) {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const px = pts[i][0] * sc
    const py = pts[i][1] * sc
    const X = x + px * c - py * s
    const Y = y + px * s + py * c
    if (i === 0) ctx.moveTo(X, Y)
    else ctx.lineTo(X, Y)
  }
  ctx.closePath()
}

export function circle(ctx, x, y, r) {
  ctx.moveTo(x + r, y)
  ctx.arc(x, y, r, 0, TAU)
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}
