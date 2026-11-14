// Runs the fairness search off the main thread. Falls back to the main thread
// if workers are unavailable.
import { findFairBoss } from './verify.js'

let worker = null
let nextId = 0
const pending = new Map()

function fallback(level, resolve) {
  setTimeout(() => resolve(findFairBoss(level)), 0)
}

export function requestFairBoss(level) {
  return new Promise((resolve) => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => {
          const p = pending.get(e.data.id)
          pending.delete(e.data.id)
          if (p) p.resolve(e.data.result)
        }
        worker.onerror = () => {
          worker = null
          for (const [, p] of pending) fallback(p.level, p.resolve)
          pending.clear()
        }
      }
      const id = ++nextId
      pending.set(id, { resolve, level })
      worker.postMessage({ id, level })
    } catch {
      fallback(level, resolve)
    }
  })
}

// Drop an in-flight search (e.g. the run ended and the level changed).
export function resetFairWorker() {
  if (worker) {
    worker.terminate()
    worker = null
  }
  pending.clear()
}
