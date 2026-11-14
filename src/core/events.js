// A tiny typed-by-convention event bus. One instance per Game, passed down; the
// simulation emits ('sever', 'phase', 'hit'…), audio and effects subscribe.
export class Emitter {
  constructor() {
    this.h = new Map()
  }

  on(name, fn) {
    if (!this.h.has(name)) this.h.set(name, new Set())
    this.h.get(name).add(fn)
    return () => this.h.get(name)?.delete(fn)
  }

  emit(name, payload) {
    const set = this.h.get(name)
    if (set) for (const fn of set) fn(payload)
  }
}
