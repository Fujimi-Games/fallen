// Bullets, sparks, the player. Boss bullets are small cream orbs with a dark rim
// (so they read on any ground); the player's are gold ticks.
import { TAU } from '../core/math.js'
import { THORN_R } from '../core/config.js'

// A thorn satellite: a tether and a small spinning diamond (a melee shape).
function drawSatellites(ctx, list, th, color, spin) {
  ctx.beginPath()
  for (const b of list) {
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.sx, b.sy)
  }
  ctx.strokeStyle = color(0.4)
  ctx.lineWidth = 1
  ctx.stroke()
  const R = THORN_R + 2.5
  ctx.beginPath()
  for (const b of list) {
    const a = b.age * spin
    for (let k = 0; k < 4; k++) {
      const t = a + (k * Math.PI) / 2
      const x = b.sx + Math.cos(t) * (k & 1 ? R * 0.5 : R)
      const y = b.sy + Math.sin(t) * (k & 1 ? R * 0.5 : R)
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  ctx.fillStyle = th.rust(0.5)
  ctx.fill()
  ctx.strokeStyle = color(1)
  ctx.lineWidth = 1.3
  ctx.stroke()
}

export function drawBullets(r, g) {
  const { bullets, boss } = g
  const ctx = r.ctx
  const th = r.theme
  if (!bullets.length) return
  const def = boss.def
  ctx.lineCap = 'round'

  // faint threads joining the neighbours of a burst: the curve being drawn
  ctx.beginPath()
  for (let i = 1; i < bullets.length; i++) {
    const b = bullets[i]
    const a = bullets[i - 1]
    if (!b.link || a.g !== b.g) continue
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.strokeStyle = th.ink(0.13)
  ctx.lineWidth = 1
  ctx.stroke()

  for (let ci = 0; ci < 3; ci++) {
    ctx.beginPath()
    let any = false
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]
      if (b.ci !== ci) continue
      ctx.moveTo(b.x + 3.4, b.y)
      ctx.arc(b.x, b.y, 3.4, 0, TAU)
      any = true
    }
    if (!any) continue
    ctx.fillStyle = th.tone(def, ci, 1)
    ctx.fill()
    ctx.strokeStyle = th.deep(0.85)
    ctx.lineWidth = 1.3
    ctx.stroke()
  }
  // a thin halo ring on each orb
  ctx.beginPath()
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]
    ctx.moveTo(b.x + 5.6, b.y)
    ctx.arc(b.x, b.y, 5.6, 0, TAU)
  }
  ctx.strokeStyle = th.ink(0.28)
  ctx.lineWidth = 0.9
  ctx.stroke()

  // thorn satellites and fission parents (a ring that tightens as the split nears)
  const thorns = []
  ctx.beginPath()
  for (const b of bullets) {
    if (!b.bt) continue
    if (b.th >= 0) thorns.push(b)
    else if (b.bt.kind === 'fission') {
      const k = Math.min(1, b.age / b.bt.p.delay)
      ctx.moveTo(b.x + 9 - 3.5 * k, b.y)
      ctx.arc(b.x, b.y, 9 - 3.5 * k, 0, TAU)
    }
  }
  ctx.strokeStyle = th.gold(0.8)
  ctx.lineWidth = 1.1
  ctx.stroke()
  if (thorns.length) drawSatellites(ctx, thorns, th, (a) => th.ink(a), 6)
}

export function drawPBullets(r, g) {
  const { pbullets } = g
  const ctx = r.ctx
  const th = r.theme
  if (!pbullets.length) return
  ctx.lineCap = 'round'
  const mine = r.playerTone(g.arsenal)
  // wings first, then the central stream: slightly thicker and in ivory, the colour of the dot
  // at the player's centre (the dot your central stream comes from)
  for (const centre of [false, true]) {
    ctx.beginPath()
    let any = false
    for (const b of pbullets) {
      if ((b.dmg > 1) !== centre) continue
      const c = Math.cos(b.a)
      const s = Math.sin(b.a)
      ctx.moveTo(b.x - c * (centre ? 15 : 13), b.y - s * (centre ? 15 : 13))
      ctx.lineTo(b.x, b.y)
      any = true
    }
    if (!any) continue
    ctx.strokeStyle = th.deep(0.6)
    ctx.lineWidth = centre ? 4.8 : 3.4
    ctx.stroke()
    ctx.strokeStyle = centre ? th.ink(1) : mine(0.95)
    ctx.lineWidth = centre ? 2.8 : 1.8
    ctx.stroke()
  }
  const thorns = pbullets.filter((b) => b.th >= 0 && b.sh && b.sh.thorn)
  if (thorns.length) drawSatellites(ctx, thorns, th, mine, 7)
}

export function drawSparks(r, g) {
  const sparks = g.fx.sparks
  const ctx = r.ctx
  const th = r.theme
  if (!sparks.length) return
  let last = null
  for (const s of sparks) {
    ctx.globalAlpha = Math.min(1, s.life / s.max) * 0.9
    const key = Math.round(s.hue / 12)
    if (key !== last) {
      ctx.fillStyle = th.tint(s.hue, 1, 80, 28)
      last = key
    }
    const sz = 1.2 * s.size
    ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz)
  }
  ctx.globalAlpha = 1
}

// The player is a crescent in line art, drawn exactly as the chosen sketch: a disc
// with a concave bite taken from the top (the horns open toward your aim). The
// hitbox is the small sun in its cup. The tint is the pigment of the last trait you
// inherited (gold until then).
const CRESCENT = new Path2D('M-22 -26A34 34 0 1 0 22 -26A24 24 0 0 1 -22 -26Z')
export function drawPlayer(r, g) {
  const { player: p } = g
  const ctx = r.ctx
  const th = r.theme
  if (!p || !p.alive) return
  if (p.inv > 0 && Math.floor(g.t * 14) % 2 === 0) return
  const mine = r.playerTone(g.arsenal)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.aim + Math.PI / 2)
  ctx.scale(0.55, 0.55)
  ctx.translate(0, -6) // the hitbox sits at the sketch's inner ring, (0, 6)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = th.deep(0.8)
  ctx.lineWidth = 7
  ctx.stroke(CRESCENT)
  ctx.strokeStyle = mine(1)
  ctx.lineWidth = 3.4
  ctx.stroke(CRESCENT)
  ctx.restore()

  // the actual hitbox: a small solid sun in a thin ring
  ctx.fillStyle = th.ink(1)
  ctx.beginPath()
  ctx.arc(p.x, p.y, 2.4, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = th.ink(p.focus ? 0.8 : 0.35)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.focus ? 7 : 5.5, 0, TAU)
  ctx.stroke()
  if (p.focus) {
    ctx.setLineDash([1.5, 4])
    ctx.beginPath()
    ctx.arc(p.x, p.y, 12, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// Hard mode only: the player aims with the mouse, so show where.
export function drawCrosshair(r, g) {
  const { mode, player, aimMode } = g
  const mouse = g.input.mouse
  const ctx = r.ctx
  if (aimMode !== 'hard' || mode === 'attract' || !player || !mouse.seen) return
  const { x, y } = mouse
  ctx.strokeStyle = r.theme.ink(0.7)
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, TAU)
  ctx.moveTo(x - 13, y)
  ctx.lineTo(x - 9, y)
  ctx.moveTo(x + 9, y)
  ctx.lineTo(x + 13, y)
  ctx.moveTo(x, y - 13)
  ctx.lineTo(x, y - 9)
  ctx.moveTo(x, y + 9)
  ctx.lineTo(x, y + 13)
  ctx.stroke()
}
