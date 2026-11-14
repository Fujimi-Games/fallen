// The boss's attack layers: Chladni field, beams and melee shapes.
import { W, H } from '../core/config.js'
import { TAU } from '../core/math.js'
import { chladni } from '../content/fields.js'
import { ringPoly } from '../content/melee.js'
import { hslToRgb } from './util.js'

const FW = 135
const FH = 240

export function drawField(r, g, R, def) {
  const ctx = r.ctx
  const vis = R.vis
  if (!vis.A || vis.stage === 0) return
  if (!r.field) {
    const fieldCanvas = document.createElement('canvas')
    fieldCanvas.width = FW
    fieldCanvas.height = FH
    const fieldCtx = fieldCanvas.getContext('2d')
    r.field = { canvas: fieldCanvas, ctx: fieldCtx, img: fieldCtx.createImageData(FW, FH) }
  }
  const L = R.L
  const stage = vis.stage
  const k = vis.k
  let danger = 0
  let lines = 1
  if (stage === 1) {
    danger = 0.12 * k * (0.7 + 0.3 * Math.sin(g.t * 20))
    lines = 0.35 + 0.65 * k
  } else if (stage === 2) {
    danger = Math.min(1, k / 0.04) * (0.78 + 0.1 * Math.sin(g.t * 7))
  } else {
    danger = 0.78 * (1 - k)
    lines = 1 - k
  }
  const dc = [198, 92, 66] // danger: rust
  const pg = def.palette[L.hue]
  const lc = hslToRgb(pg.h, 34, 84) // the nodal lines: ivory washed with the field's pigment
  const { ctx: fieldCtx, img: fieldImg, canvas: fieldCanvas } = r.field
  const data = fieldImg.data
  const [A, B] = [vis.A, vis.B]
  const blend = vis.blend || 0
  const thr = L.thr
  for (let j = 0; j < FH; j++) {
    const v = (j + 0.5) / FH
    for (let i = 0; i < FW; i++) {
      const u = (i + 0.5) / FW
      let f = chladni(A[0], A[1], u, v)
      if (blend) f = f * (1 - blend) + chladni(B[0], B[1], u, v) * blend
      const a = Math.abs(f)
      // danger: dim cymatic ripples that flow toward the safe lines
      const base = Math.min(1, Math.max(0, (a - thr * 0.55) / (thr * 0.9)))
      const rip = 0.5 + 0.5 * Math.sin(a * 11 - g.t * 4.5)
      const d = base * (0.3 + 0.7 * rip * rip) * danger
      // glowing nodal line
      const ln = Math.exp(-(a * a) / 0.0016) * lines
      const o = (j * FW + i) * 4
      data[o] = Math.min(255, dc[0] * d * 0.4 + lc[0] * ln * 0.55)
      data[o + 1] = Math.min(255, dc[1] * d * 0.4 + lc[1] * ln * 0.55)
      data[o + 2] = Math.min(255, dc[2] * d * 0.4 + lc[2] * ln * 0.55)
      data[o + 3] = 255
    }
  }
  fieldCtx.putImageData(fieldImg, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(fieldCanvas, 0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
}

export function drawRays(r, g, R, def, boss) {
  const ctx = r.ctx
  const th = r.theme
  const vis = R.vis
  if (!vis.angles || vis.stage === 0) return
  const len = 1500
  ctx.lineCap = 'round'

  // faint trails of the harmonograph
  for (const h of R.hist) {
    const al = Math.max(0, 1 - h.t / 0.7) * 0.18
    ctx.strokeStyle = th.ink(al)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const a of h.a) {
      ctx.moveTo(boss.x, boss.y)
      ctx.lineTo(boss.x + Math.cos(a) * len, boss.y + Math.sin(a) * len)
    }
    ctx.stroke()
  }

  for (const a of vis.angles) {
    ctx.beginPath()
    ctx.moveTo(boss.x, boss.y)
    ctx.lineTo(boss.x + Math.cos(a) * len, boss.y + Math.sin(a) * len)
    if (vis.stage === 1) {
      // warning: a dotted line that firms up
      const k = vis.k
      ctx.setLineDash([1.5, 9])
      ctx.lineDashOffset = -g.t * 40
      ctx.lineWidth = 1.6
      ctx.strokeStyle = th.ink(0.25 + 0.6 * k)
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      const w = vis.width
      ctx.strokeStyle = th.rust(0.2)
      ctx.lineWidth = w * 1.8
      ctx.stroke()
      ctx.strokeStyle = th.rust(0.5)
      ctx.lineWidth = w
      ctx.stroke()
      ctx.strokeStyle = th.pig(def.palette[R.L.hue], 0.95, 18)
      ctx.lineWidth = Math.max(1.2, w * 0.22)
      ctx.stroke()
    }
  }
}

// Melee shapes. Circles that share a chain id are drawn as one beaded wire (a
// rose, a snowflake, a spiral arm); lone circles are blades; sectors are scythes;
// rings are shockwaves. Live hazards get a rust wash so the danger reads at a glance.
// `tele` draws the harmless warning; `ghost` a faint afterimage.
export function drawShapes(r, g, shapes, tones, tele, fade = 1, ghost = false, friendly = false) {
  const ctx = r.ctx
  const th = r.theme
  if (!shapes.length) return
  // a hazard washes rust; the player's own swing washes gold
  const wash = friendly ? (a) => th.gold(a * 0.6) : (a) => th.rust(a)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const dash = () => {
    ctx.setLineDash([2, 8])
    ctx.lineDashOffset = -g.t * 30
  }

  const chains = new Map()
  for (const sh of shapes) {
    if (sh.k !== 0 || sh.ch < 0) continue
    let c = chains.get(sh.ch)
    if (!c) chains.set(sh.ch, (c = []))
    c.push(sh)
  }
  for (const c of chains.values()) {
    const al = (c[0].al === undefined ? 1 : c[0].al) * fade
    const rad = c[0].r
    const tone = tones[(c[0].c || 0) & 1]
    ctx.beginPath()
    ctx.moveTo(c[0].x, c[0].y)
    for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y)
    if (c[0].cl) ctx.closePath()
    if (tele) {
      dash()
      ctx.strokeStyle = th.ink(0.55 * al)
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])
      continue
    }
    if (!ghost) {
      ctx.strokeStyle = wash(0.2 * al)
      ctx.lineWidth = rad * 2
      ctx.stroke()
    }
    ctx.strokeStyle = tone((ghost ? 0.3 : 0.95) * al)
    ctx.lineWidth = ghost ? 1.2 : 1.8
    ctx.stroke()
    if (!ghost) {
      // beads along the wire
      ctx.fillStyle = th.ink(0.95 * al)
      ctx.beginPath()
      for (let i = 0; i < c.length; i += 6) {
        ctx.moveTo(c[i].x + 2.4, c[i].y)
        ctx.arc(c[i].x, c[i].y, 2.4, 0, TAU)
      }
      ctx.fill()
    }
  }

  for (const sh of shapes) {
    if (sh.k === 0 && sh.ch >= 0) continue
    const al = (sh.al === undefined ? 1 : sh.al) * fade
    const line = tones[(sh.c || 0) & 1]
    if (tele) dash()
    if (sh.k === 0) {
      ctx.beginPath()
      ctx.arc(sh.x, sh.y, sh.r, 0, TAU)
      if (!tele && !ghost) {
        ctx.fillStyle = wash(0.22 * al)
        ctx.fill()
      }
      ctx.strokeStyle = line((tele ? 0.55 : ghost ? 0.3 : 0.95) * al)
      ctx.lineWidth = tele ? 1.4 : ghost ? 1.2 : 1.9
      ctx.stroke()
      if (!tele && !ghost) {
        ctx.fillStyle = th.ink(0.95 * al)
        ctx.beginPath()
        ctx.arc(sh.x, sh.y, 2.2, 0, TAU)
        ctx.fill()
      }
    } else if (sh.k === 1) {
      ctx.beginPath()
      ctx.moveTo(sh.x, sh.y)
      ctx.arc(sh.x, sh.y, sh.rad, sh.a - sh.half, sh.a + sh.half)
      ctx.closePath()
      ctx.fillStyle = wash((tele ? 0.05 : ghost ? 0.06 : 0.2) * al)
      ctx.fill()
      ctx.strokeStyle = line((tele ? 0.55 : ghost ? 0.3 : 0.95) * al)
      ctx.lineWidth = tele ? 1.4 : ghost ? 1.2 : 1.9
      ctx.stroke()
      if (!tele && !ghost) {
        // concentric dotted arcs inside the scythe
        ctx.setLineDash([1.5, 6])
        ctx.strokeStyle = th.ink(0.5 * al)
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.arc(sh.x, sh.y, sh.rad * 0.66, sh.a - sh.half, sh.a + sh.half)
        ctx.moveTo(sh.x + Math.cos(sh.a + sh.half) * sh.rad * 0.33, sh.y + Math.sin(sh.a + sh.half) * sh.rad * 0.33)
        ctx.arc(sh.x, sh.y, sh.rad * 0.33, sh.a + sh.half, sh.a - sh.half, true)
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      const poly = ringPoly(sh) // the very polyline the hit test uses
      ctx.moveTo(poly[0], poly[1])
      for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1])
      ctx.closePath()
      if (!tele && !ghost) {
        ctx.strokeStyle = wash(0.28 * al)
        ctx.lineWidth = sh.thick
        ctx.stroke()
      }
      ctx.strokeStyle = line((tele ? 0.5 : ghost ? 0.25 : 0.95) * al)
      ctx.lineWidth = tele ? 1.4 : ghost ? 1.2 : 1.8
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
}
