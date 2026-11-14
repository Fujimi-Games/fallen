// Fixed-step simulation with a render callback per animation frame.
import { STEP } from '../core/config.js'

export class Loop {
  constructor({ update, frame, paused = () => false, raf = (f) => requestAnimationFrame(f), caf = (h) => cancelAnimationFrame(h) }) {
    this.update = update
    this.frame = frame
    this.paused = paused
    this.raf = raf
    this.caf = caf
    this.handle = 0
    this.running = false
  }

  start() {
    this.running = true
    let last = performance.now()
    let acc = 0
    const tick = (now) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!this.paused()) {
        acc += dt
        while (acc >= STEP) {
          this.update(STEP)
          acc -= STEP
        }
      }
      this.frame(dt)
      this.handle = this.raf(tick)
    }
    this.handle = this.raf(tick)
  }

  stop() {
    this.running = false
    this.caf(this.handle)
  }
}
