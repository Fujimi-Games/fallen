import { findFairBoss } from './verify.js'

self.onmessage = (e) => {
  const { id, level } = e.data
  self.postMessage({ id, result: findFairBoss(level) })
}
