// On-canvas text: score, banners, pause. Engraved serif, wide-set, no glow.
import { W, H } from '../core/config.js'

// a short rule with a small diamond in the middle, above and below titles
function rule(ctx, th, y, half, a) {
  ctx.strokeStyle = th.ink(0.5 * a)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(W / 2 - half, y)
  ctx.lineTo(W / 2 - 9, y)
  ctx.moveTo(W / 2 + 9, y)
  ctx.lineTo(W / 2 + half, y)
  ctx.stroke()
  ctx.fillStyle = th.ink(0.8 * a)
  ctx.beginPath()
  ctx.moveTo(W / 2, y - 3.5)
  ctx.lineTo(W / 2 + 3.5, y)
  ctx.lineTo(W / 2, y + 3.5)
  ctx.lineTo(W / 2 - 3.5, y)
  ctx.closePath()
  ctx.fill()
}

export function drawScore(r, g) {
  const ctx = r.ctx
  const th = r.theme
  if (g.mode === 'attract') return
  ctx.textAlign = 'right'
  th.setMono(ctx, 22, 400, 2)
  ctx.fillStyle = th.ink(0.95)
  ctx.fillText(g.run.score.toLocaleString('en-US'), W - 24, 40)
  th.setFont(ctx, 11, 500, 4, true)
  ctx.fillStyle = th.ink(0.5)
  ctx.fillText(`${g.run.bosses} ${g.run.bosses === 1 ? 'boss' : 'bosses'} fallen`, W - 24, 56)
  ctx.textAlign = 'left'
}

// Banner text is always centred on the screen, capped in length and shrunk to fit,
// so nothing can run off the edge: title <= 16 characters, subtitles <= 44-46.
const MAX = { title: 16, sub: 44, sub2: 46 }
const MAX_W = W - 70
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

// sets the font so `text` fits MAX_W: tries `size`, then smaller (letter spacing scales)
function fit(ctx, th, text, size, weight, spacing, italic = false) {
  let s = size
  for (; s > 11; s--) {
    th.setFont(ctx, s, weight, (spacing * s) / size, italic)
    if (ctx.measureText(text).width <= MAX_W) return
  }
  th.setFont(ctx, s, weight, (spacing * s) / size, italic)
}

export function drawBanners(r, g) {
  const { boss, banner, mode } = g
  const ctx = r.ctx
  const th = r.theme
  const cy = H / 2
  ctx.textAlign = 'center'
  if (mode === 'intro') {
    const k = boss.age
    const a = Math.min(1, Math.max(0, (k - 0.5) / 0.5)) * Math.min(1, Math.max(0, (2.6 - k) / 0.5))
    if (a > 0) {
      const name = clip(boss.def.name.toUpperCase(), 30)
      rule(ctx, th, cy - 44, 90, a)
      fit(ctx, th, name, 30, 600, 7)
      ctx.fillStyle = th.tint(boss.def.hues[0], a, 74, 24)
      ctx.fillText(name, W / 2, cy)
      th.setFont(ctx, 12, 500, 5, true)
      ctx.fillStyle = th.ink(a * 0.6)
      ctx.fillText(`seed ${boss.def.code}`, W / 2, cy + 24)
      rule(ctx, th, cy + 42, 90, a)
    }
  }
  if (banner) {
    const k = banner.t / banner.dur
    const a = Math.min(1, banner.t / 0.25) * Math.min(1, Math.max(0, (1 - k) / 0.2))
    if (a > 0) {
      const win = banner.text === 'BOSS DOWN'
      const color = banner.tone ? th[banner.tone] : banner.warn || (!win && !banner.small) ? th.rust : win ? th.gold : th.ink
      const title = clip(banner.text, MAX.title)
      const sub = banner.sub ? clip(banner.sub, MAX.sub) : ''
      const sub2 = banner.sub2 ? clip(banner.sub2.toUpperCase(), MAX.sub2) : ''
      const half = banner.small ? 70 : 110
      // the block is centred on the screen: rule, title, subtitle(s), rule
      const h = (banner.small ? 28 : 50) * 0.6 + (sub ? 28 : 0) + (sub2 ? 32 : 0)
      const y = cy - h / 2 + (banner.small ? 10 : 18)
      rule(ctx, th, y - (banner.small ? 28 : 44), half, a)
      fit(ctx, th, title, banner.small ? 28 : 50, 600, banner.small ? 9 : 14)
      ctx.fillStyle = color(a)
      ctx.fillText(title, W / 2 + (banner.small ? 4 : 7), y)
      if (sub) {
        fit(ctx, th, sub, 14, 500, 3, true)
        ctx.fillStyle = th.ink(a * 0.78)
        ctx.fillText(sub, W / 2, y + 28)
      }
      if (sub2) {
        fit(ctx, th, sub2, 15, 600, 4)
        ctx.fillStyle = th.gold(a)
        ctx.fillText(sub2, W / 2, y + 60)
      }
      rule(ctx, th, y + (sub2 ? 80 : sub ? 50 : 30), half, a)
    }
  }
  if (g.paused) {
    ctx.fillStyle = th.deep(0.72)
    ctx.fillRect(0, 0, W, H)
    rule(ctx, th, H / 2 - 40, 100, 1)
    th.setFont(ctx, 38, 500, 14)
    ctx.fillStyle = th.ink(0.95)
    ctx.fillText('PAUSED', W / 2 + 7, H / 2)
    th.setFont(ctx, 14, 500, 5, true)
    ctx.fillStyle = th.ink(0.6)
    ctx.fillText('esc to resume', W / 2, H / 2 + 30)
    rule(ctx, th, H / 2 + 50, 100, 1)
  }
  ctx.textAlign = 'left'
}
