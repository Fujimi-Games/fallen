// Key/value persistence behind one interface. Defaults to localStorage when it
// exists and falls back to memory (tests, private mode), so callers never guard.
export class Store {
  constructor(backend = defaultBackend()) {
    this.backend = backend
    this.mem = new Map()
  }

  get(key, fallback = null) {
    try {
      const raw = this.backend ? this.backend.getItem(key) : this.mem.get(key)
      if (raw == null) return fallback
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  set(key, value) {
    const raw = JSON.stringify(value)
    try {
      if (this.backend) this.backend.setItem(key, raw)
      else this.mem.set(key, raw)
    } catch {
      this.mem.set(key, raw)
    }
  }
}

function defaultBackend() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}
