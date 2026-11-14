// Bosses come from a background search that proves each one is survivable. The
// level of a boss is the number of bosses cleared in the current run, so a search
// is always for a specific level. `client` is { request(level) -> Promise, reset() }.
export class BossSupply {
  constructor(client, onWaitingChange = () => {}) {
    this.client = client
    this.onWaitingChange = onWaitingChange
    this.next = null // a proven boss ready for `level`
    this.fetching = null // level being searched, or null
    this.waiting = null // {level, cb}
    this.destroyed = false
  }

  prefetch(level) {
    if (this.next && this.next.level === level) return
    if (this.fetching === level) return
    if (this.fetching !== null) this.client.reset() // stale: the run changed level
    this.next = null
    this.fetching = level
    this.client.request(level).then((res) => {
      if (this.destroyed || this.fetching !== level) return
      this.fetching = null
      res.level = level
      this.next = res
      if (this.waiting && this.waiting.level === level) {
        const cb = this.waiting.cb
        this.waiting = null
        this.onWaitingChange()
        cb()
      }
    })
  }

  // Take the proven boss for `level` if it is ready.
  take(level) {
    if (!this.next || this.next.level !== level) return null
    const res = this.next
    this.next = null
    return res
  }

  // Run cb now if the boss for `level` is ready, else when it arrives.
  whenReady(level, cb) {
    if (this.next && this.next.level === level) return cb()
    this.waiting = { level, cb }
    this.prefetch(level)
    this.onWaitingChange()
  }

  destroy() {
    this.destroyed = true
  }
}
