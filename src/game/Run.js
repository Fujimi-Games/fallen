// One run's score, plus the persistent best run and lifetime record.
// A run lasts until the player's last trait is gone; its level is the number of
// bosses cleared in it.
import { ramp } from '../content/difficulty.js'

const BEST_KEY = 'fallen.best.v1'
const RECORD_KEY = 'fallen.record.v1'

export class Run {
  constructor(store) {
    this.store = store
    const b = store.get(BEST_KEY)
    this.best = b ? { score: b.score | 0, bosses: b.bosses | 0 } : { score: 0, bosses: 0 }
    const r = store.get(RECORD_KEY)
    this.record = r && typeof r.wins === 'number' ? { wins: r.wins, deaths: r.deaths | 0 } : { wins: 0, deaths: 0 }
    this.begin()
  }

  begin() {
    this.score = 0
    this.bosses = 0
    this.noHit = true
  }

  // Point values follow the same ramp as the difficulty and plateau with it.
  levelFactor() {
    return 1 + 4 * ramp(this.bosses)
  }

  award(points) {
    this.score += Math.round(points)
  }

  // Flat clear bonus plus a no-hit bonus, scaled by the level factor.
  clearBonus() {
    const lf = this.levelFactor()
    return Math.round(1000 * lf + (this.noHit ? 1000 * lf : 0))
  }

  win() {
    this.score += this.clearBonus()
    this.bosses++
    this.record.wins++
    this.store.set(RECORD_KEY, this.record)
    this.saveBest()
  }

  death() {
    this.record.deaths++
    this.store.set(RECORD_KEY, this.record)
    this.saveBest()
  }

  saveBest() {
    if (this.score > this.best.score || this.bosses > this.best.bosses) {
      this.best = { score: Math.max(this.best.score, this.score), bosses: Math.max(this.best.bosses, this.bosses) }
      this.store.set(BEST_KEY, this.best)
    }
  }
}
