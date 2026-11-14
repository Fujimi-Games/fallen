// Draws a Game each frame. Owns the canvas, the paper texture and the field
// texture; the draw functions are stateless modules that take (renderer, game).
// The look lives in the Theme: no glow, no bloom, no additive blending.
import { W, H } from '../core/config.js'
import { TAU } from '../core/math.js'
import { MELEE } from '../content/melee.js'
import { swingShapes } from '../content/playerMelee.js'
import { Theme } from './theme.js'
import { GHOSTS } from './util.js'
import { drawField, drawRays, drawShapes } from './layers.js'
import { drawBoss } from './boss.js'
import { drawBullets, drawPBullets, drawSparks, drawPlayer, drawCrosshair } from './entities.js'
import { drawScore, drawBanners } from './hud.js'

// value noise on a coarse lattice, bilinearly smoothed: the mottled paper
function makePaper(theme) {
  const cw = 135
  const ch = 240
  const cv = document.createElement('canvas')
  cv.width = cw
  cv.height = ch
  const cx = cv.getContext('2d')
  const img = cx.createImageData(cw, ch)
  const lattice = (n, seed) => {
    const a = []
    let s = seed
    for (let i = 0; i < n; i++) {
      s = (s * 1664525 + 1013904223) >>> 0
      a.push(s / 4294967296)
    }
    return a
  }
  const octs = [
    { n: 6, w: 0.55, a: lattice(7 * 11, 11) },
    { n: 13, w: 0.3, a: lattice(14 * 24, 29) },
    { n: 30, w: 0.15, a: lattice(31 * 54, 53) },
  ]
  const sample = (o, u, v) => {
    const gx = u * o.n
    const gy = v * (o.n * (ch / cw))
    const i = Math.floor(gx)
    const j = Math.floor(gy)
    const fx = gx - i
    const fy = gy - j
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const cols = o.n + 1
    const p = (x, y) => o.a[(y * cols + x) % o.a.length]
    return p(i, j) * (1 - sx) * (1 - sy) + p(i + 1, j) * sx * (1 - sy) + p(i, j + 1) * (1 - sx) * sy + p(i + 1, j + 1) * sx * sy
  }
  const lo = [15, 26, 46]
  const hi = [22, 38, 66]
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let n = 0
      for (const o of octs) n += o.w * sample(o, x / cw, y / ch)
      const k = Math.min(1, Math.max(0, (n - 0.25) / 0.5))
      const o4 = (y * cw + x) * 4
      img.data[o4] = lo[0] + (hi[0] - lo[0]) * k
      img.data[o4 + 1] = lo[1] + (hi[1] - lo[1]) * k
      img.data[o4 + 2] = lo[2] + (hi[2] - lo[2]) * k
      img.data[o4 + 3] = 255
    }
  }
  cx.putImageData(img, 0, 0)
  return cv
}

export class Renderer {
  constructor(canvas, theme = new Theme()) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.theme = theme
    this.paper = makePaper(theme)
    this.field = null // Chladni texture, created on first use
    this.vignette = null
    this.ghostBuf = []
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  destroy() {
    this.ro.disconnect()
  }

  // the player's colour: gold until a trait is inherited, then that trait's pigment
  playerTone(arsenal, dl = 0) {
    const has = ['spawner', 'motion', 'mod', 'shot', 'melee'].some((k) => arsenal[k] && arsenal[k].length)
    return has ? (a) => `hsla(${arsenal.hue}, 50%, ${Math.min(90, 72 + dl)}%, ${a})` : (a) => this.theme.gold(a)
  }

  resize() {
    const c = this.canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(2, Math.round(c.clientWidth * dpr))
    const h = Math.max(2, Math.round(c.clientHeight * dpr))
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
  }

  // indigo paper, a soft vignette, and the star-chart under everything: a dotted
  // axis, concentric circles and a slowly turning ring of dots
  drawGround(t) {
    const { ctx } = this
    const th = this.theme
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.paper, 0, 0, W, H)
    if (!this.vignette) {
      this.vignette = ctx.createRadialGradient(W / 2, H * 0.46, 120, W / 2, H * 0.5, H * 0.78)
      this.vignette.addColorStop(0, 'rgba(10,18,33,0)')
      this.vignette.addColorStop(1, 'rgba(6,11,22,0.62)')
    }
    ctx.fillStyle = this.vignette
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2
    const cy = H * 0.5
    ctx.lineWidth = 1
    ctx.strokeStyle = th.ink(0.06)
    for (const rad of [96, 168, 236, 304]) {
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, TAU)
      ctx.stroke()
    }
    // the dotted axis
    ctx.setLineDash([1.5, 7])
    ctx.strokeStyle = th.ink(0.16)
    ctx.beginPath()
    ctx.moveTo(cx, 14)
    ctx.lineTo(cx, H - 14)
    ctx.stroke()
    ctx.setLineDash([])
    // a ring of dots turning very slowly
    ctx.fillStyle = th.ink(0.2)
    ctx.beginPath()
    for (let i = 0; i < 60; i++) {
      const a = (TAU * i) / 60 + t * 0.01
      ctx.moveTo(cx + Math.cos(a) * 130 + 1.1, cy + Math.sin(a) * 130)
      ctx.arc(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130, 1.1, 0, TAU)
    }
    ctx.fill()
  }

  drawFrame() {
    const { ctx } = this
    const th = this.theme
    ctx.lineWidth = 1.4
    ctx.strokeStyle = th.ink(0.55)
    ctx.strokeRect(5, 5, W - 10, H - 10)
    ctx.lineWidth = 0.8
    ctx.strokeStyle = th.ink(0.22)
    ctx.strokeRect(10, 10, W - 20, H - 20)
    // small suns at the corners and mid-edges
    ctx.fillStyle = th.ink(0.7)
    ctx.beginPath()
    for (const [x, y] of [[5, 5], [W - 5, 5], [5, H - 5], [W - 5, H - 5], [W / 2, 5], [W / 2, H - 5]]) {
      ctx.moveTo(x + 2.4, y)
      ctx.arc(x, y, 2.4, 0, TAU)
    }
    ctx.fill()
  }

  render(g) {
    const { ctx, canvas, ghostBuf, theme } = this
    const boss = g.boss
    if (!boss) return
    const s = canvas.width / W
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.setLineDash([])
    const def = boss.def

    this.drawGround(g.t)

    ctx.save()
    const shake = g.fx.shake
    if (shake > 0.25) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)

    for (const R of boss.layers) if (R.L.type === 'chladni') drawField(this, g, R, def)
    g.fx.grid.draw(ctx, theme)
    for (const R of boss.layers) if (R.L.type === 'rays') drawRays(this, g, R, def, boss)
    for (const R of boss.layers) {
      if (R.L.type !== 'melee' || R.off || R.vis.stage === 0) continue
      const mc = def.palette[R.L.hue]
      const hs = [(a) => theme.pig(mc, a), (a) => theme.pig(mc, a, 14)]
      if (R.vis.stage >= 2 && R.o) {
        // afterimages: the shape function is pure in time, so ghosts are free
        for (let i = GHOSTS.length - 1; i >= 0; i--) {
          const d = GHOSTS[i]
          ghostBuf.length = 0
          MELEE[R.L.melee].shapes(R.L.mp, { ...R.o, t: R.o.t - d, tauOn: R.o.tauOn - d }, ghostBuf)
          drawShapes(this, g, ghostBuf, hs, false, 0.34 * (1 - d / 0.26), true)
        }
      }
      drawShapes(this, g, R.shapes, hs, R.vis.stage === 1)
    }
    if (!boss.dead) drawBoss(this, g, boss)
    drawBullets(this, g)
    drawPBullets(this, g)
    drawSparks(this, g)
    if (g.pm.on) {
      const hs = [this.playerTone(g.arsenal), this.playerTone(g.arsenal, 12)]
      for (let i = GHOSTS.length - 1; i >= 0; i--) {
        const d = GHOSTS[i]
        if (g.pm.t - d < 0) continue
        swingShapes(g.pm.parts, g.pm.t - d, g.pm.px, g.pm.py, g.pm.aim, ghostBuf)
        drawShapes(this, g, ghostBuf, hs, false, 0.34 * (1 - d / 0.26), true, true)
      }
      drawShapes(this, g, g.pm.shapes, hs, false, 1, false, true)
    }
    drawPlayer(this, g)
    this.drawFrame()
    ctx.restore()

    drawCrosshair(this, g)
    drawScore(this, g)
    drawBanners(this, g)
  }
}
