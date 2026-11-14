// Small seeded PRNG so a boss is fully reproducible from its seed.
export function mulberry32(seed) {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const range = (r, a, b) => a + (b - a) * r()
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)]

// weights: { key: weight }
export function weighted(r, weights) {
  const keys = Object.keys(weights)
  let total = 0
  for (const k of keys) total += weights[k]
  let x = r() * total
  for (const k of keys) {
    x -= weights[k]
    if (x <= 0) return k
  }
  return keys[keys.length - 1]
}
