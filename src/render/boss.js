// The boss body, drawn as an orrery in line art: three nested outlines of its
// superformula, orbit rings, and one planet per trait. The outer outline is split
// into one arc per trait in that trait's pigment (a severed trait's arc goes dark);
// the inner outlines use the layer's colours.
import { TAU } from '../core/math.js'
import { poly } from './util.js'

// a melee hit makes the whole body tremble (kept under 4px so the planets stay where their
// hitboxes are, to within a hair)
export function drawBoss(r, g, boss) {
  const ctx = r.ctx
  if (!(boss.shake > 0)) return drawBossBody(r, g, boss)
  const k = boss.shake * boss.shake
  ctx.save()
  ctx.translate(Math.sin(g.t * 140) * 4 * k, Math.cos(g.t * 170) * 3 * k)
  drawBossBody(r, g, boss)
  ctx.restore()
}

function drawBossBody(r, g, boss) {
  const ctx = r.ctx
  const th = r.theme
  const def = boss.def
  const arrive = Math.min(1, boss.t / 1.4)
  const sc = 46 * (1 - Math.pow(1 - arrive, 3)) * (1 + 0.03 * Math.sin(boss.t * 3) + boss.flash * 0.07)
  const stag = boss.stagger > 0 ? 0.55 + 0.45 * Math.sin(g.t * 50) : 1
  const lift = boss.flash * 22
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // orbit rings
  ctx.lineWidth = 1
  ctx.strokeStyle = th.ink(0.2 * stag)
  ctx.beginPath()
  ctx.arc(boss.x, boss.y, sc * 1.32, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([1.5, 6])
  ctx.strokeStyle = th.ink(0.4 * stag)
  ctx.beginPath()
  ctx.arc(boss.x, boss.y, sc * 1.7, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])

  // the body: filled, then the outer outline in one arc per trait
  ctx.fillStyle = th.deep(0.55)
  poly(ctx, def.body, boss.x, boss.y, boss.rot, sc)
  ctx.fill()
  const traits = def.traits
  const n = traits.length
  const body = def.body
  const c = Math.cos(boss.rot)
  const s = Math.sin(boss.rot)
  const at = (i) => {
    const p = body[i % body.length]
    return [boss.x + (p[0] * c - p[1] * s) * sc, boss.y + (p[0] * s + p[1] * c) * sc]
  }
  ctx.lineWidth = 2
  for (let k = 0; k < n; k++) {
    const i0 = Math.floor((k * body.length) / n)
    const i1 = Math.floor(((k + 1) * body.length) / n)
    ctx.beginPath()
    const a = at(i0)
    ctx.moveTo(a[0], a[1])
    for (let i = i0 + 1; i <= i1; i++) {
      const p = at(i)
      ctx.lineTo(p[0], p[1])
    }
    ctx.strokeStyle = boss.gone[k] ? th.ink(0.18 * stag) : th.pig(traits[k].color, stag, 4 + lift)
    ctx.stroke()
  }
  const pal = def.palette
  ctx.lineWidth = 1.3
  ctx.strokeStyle = th.pig(pal[1] || pal[0], 0.9 * stag, lift)
  poly(ctx, def.body, boss.x, boss.y, -boss.rot * 1.6 + 0.5, sc * 0.64)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.strokeStyle = th.ink(0.7 * stag)
  poly(ctx, def.body, boss.x, boss.y, boss.rot * 2.3, sc * 0.3)
  ctx.stroke()

  // one small pip per trait on the outer ring, in the trait's pigment (a legend, not a target)
  const cur = boss.currentTrait()
  for (let i = 0; i < n; i++) {
    const a = boss.rot * 0.35 - Math.PI / 2 + (TAU * i) / n
    const x = boss.x + Math.cos(a) * sc * 1.7
    const y = boss.y + Math.sin(a) * sc * 1.7
    ctx.beginPath()
    ctx.arc(x, y, boss.gone[i] ? 2.2 : 3, 0, TAU)
    if (boss.gone[i]) {
      ctx.strokeStyle = th.ink(0.4)
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      ctx.fillStyle = th.pig(traits[i].color, i === cur ? 1 : 0.55, 2)
      ctx.fill()
    }
  }

  // the weak spots: the current stage's, orbiting the body on the orbit trait's path. Each is
  // drawn at its true hitbox size; the ivory arc drains as it is shot.
  if (cur >= 0) {
    const color = traits[cur].color
    for (const sp of boss.activeSpots()) {
      const frac = sp.hp / sp.spot.hp
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, sp.r, 0, TAU)
      ctx.fillStyle = th.pig(color, 0.95 * stag, 2)
      ctx.fill()
      ctx.strokeStyle = th.deep(0.9)
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, sp.r + 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
      ctx.strokeStyle = th.ink(0.95 * stag)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // bare: a gold ring that shrinks with the finishing hits left
  if (boss.finishHp !== undefined && boss.phase.id === 'bare') {
    const k = Math.max(0, boss.finishHp / boss.def.briefHp)
    ctx.beginPath()
    ctx.arc(boss.x, boss.y, sc * 1.15, -Math.PI / 2, -Math.PI / 2 + TAU * k)
    ctx.strokeStyle = th.gold(0.95)
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // the sun
  ctx.fillStyle = th.ink(0.85 + 0.15 * Math.sin(boss.t * 5))
  ctx.beginPath()
  ctx.arc(boss.x, boss.y, 3.4, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = th.ink(0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(boss.x, boss.y, 7, 0, TAU)
  ctx.stroke()
}
