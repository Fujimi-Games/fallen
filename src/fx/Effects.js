// Visual feedback state that the simulation pokes and the renderer reads:
// sparks, screen shake and the spring grid. No drawing happens here.
import { Grid } from './Grid.js'
import { TAU } from '../core/math.js'
import { W, H } from '../core/config.js'

export class Effects {
  constructor() {
    this.grid = new Grid(W, H)
    this.sparks = []
    this.shake = 0
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount)
  }

  spark(x, y, hue, n, speed, life, light = 70, dir = null, size = 1) {
    if (this.sparks.length > 2600) return
    for (let i = 0; i < n; i++) {
      const a = dir == null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 0.9
      const s = speed * (0.25 + Math.random() * 0.75)
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.5 + Math.random() * 0.7),
        max: life,
        hue,
        light,
        size,
      })
    }
  }

  // Turn a fraction of the bullets in `arr` into sparks (their hue is hues[b.ci]).
  dissolve(arr, chance, hues) {
    if (!arr.length) return
    for (const b of arr) {
      if (Math.random() < chance) this.spark(b.x, b.y, hues[b.ci], 1, 120, 0.6, 70)
    }
  }

  update(dt) {
    this.shake *= Math.exp(-dt * 7)
    this.grid.update(dt)
    const arr = this.sparks
    let w = 0
    const drag = Math.exp(-dt * 2.2)
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]
      s.life -= dt
      if (s.life <= 0) continue
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vx *= drag
      s.vy *= drag
      arr[w++] = s
    }
    arr.length = w
  }
}
