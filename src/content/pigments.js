// Procedural colour from traits. Every equation family has a pigment (a hue in
// the muted, mineral range of old illuminated manuscripts); the trait's own
// parameters nudge it, so two bosses with the same spawner still differ:
//   spawner   -> base hue (by family) ± a drift taken from its parameters;
//                lightness follows bullet speed
//   motion    -> shifts the hue / saturation (straight chalky, snake warmer,
//                curl cooler, flow shifted toward green)
//   modulator -> the second colour of the layer (spin: analogous, pendulum:
//                split-complement, pulse: a pale tint, drift: the other way)
//   melee     -> a warm pigment by shape, laser: amber
// Rust (hue ~12) is reserved for hazards, so no bullet pigment lands there.
const FAMILY = { phyllotaxis: 46, rose: 332, superformula: 272, lissajous: 212, spirograph: 164, epicycloid: 296, hypocycloid: 186, limacon: 128, koch: 198, dragon: 84, frost: 206, petals: 318, chaos: 252 }
const MOTION = { straight: { dh: 0, ds: -8, dl: 5 }, snake: { dh: 16, ds: 6, dl: 0 }, curl: { dh: -18, ds: 4, dl: -3 }, flow: { dh: 30, ds: 8, dl: 2 } }
const MOD = { spin: { dh: 34, ds: 0, dl: 0 }, pendulum: { dh: 150, ds: -8, dl: -2 }, pulse: { dh: 0, ds: -12, dl: 12 }, drift: { dh: -40, ds: 2, dl: 0 } }
const MELEE_HUE = { blades: 40, sweep: 24, pulse: 14, rosette: 346, spiral: 332, ribbon: 18, limacon: 322, epicycloid: 300, hypocycloid: 188, lemniscate: 258, logspiral: 140, koch: 196, dragon: 88, levy: 62, arrowhead: 172, hilbert: 232 }
const PATH_HUE = { lissajous: 212, rose: 332, lemniscate: 258, spirograph: 164, limacon: 128, epicycloid: 296, hypocycloid: 186, koch: 198 }

const wrap = (h) => ((h % 360) + 360) % 360
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const frac = (x) => x - Math.floor(x)

// a stable number in [0,1) from a trait's numeric parameters
function paramHash(p) {
  let s = 0
  for (const k in p) if (typeof p[k] === 'number') s += p[k] * (k.length + 1.7)
  return frac(s * 0.6180339887)
}
// bullets keep out of the rust band (hazards own it): hues 352..26 are pushed out of it
const offRust = (h) => {
  h = wrap(h)
  return h >= 352 || h <= 26 ? (h >= 352 || h < 4 ? 346 : 34) : h
}
// muted on purpose: the same family as the ivory / gold / rust of the rest of the game
const px = (h, s, l) => ({ h: Math.round(wrap(h)), s: Math.round(clamp(s, 16, 36)), l: Math.round(clamp(l, 52, 66)) })

// [primary, secondary] colours of an emitter layer
export function emitterPigments(L) {
  const base = (FAMILY[L.spawner] ?? 210) + (paramHash(L.p) - 0.5) * 26
  const light = 58 + clamp((L.speed - 140) / 80, -1, 1) * 5 // faster bullets are a little brighter
  const mo = MOTION[L.motion] || MOTION.straight
  const c0 = px(offRust(base + mo.dh), 30 + mo.ds, light + mo.dl)
  const md = L.mod ? MOD[L.mod] : { dh: 22, ds: -6, dl: 6 }
  const c1 = px(offRust(c0.h + md.dh), c0.s + md.ds, c0.l + md.dl)
  return [c0, c1]
}

export function meleePigment(L) {
  if (L.type === 'rays') return px(40, 36, 64) // amber
  return px((MELEE_HUE[L.melee] ?? 20) + (paramHash(L.mp) - 0.5) * 16, 34, 62)
}

export function chladniPigment(L) {
  return px(205 + paramHash({ thr: L.thr, T: L.T }) * 40, 24, 62)
}

export function pathPigment(kind) {
  return px(PATH_HUE[kind] ?? 210, 26, 62)
}

// Colour of one trait (what its planet and its region of the body are tinted with).
export function traitPigment(t, L, pathKind) {
  if (t.kind === 'path') return pathPigment(pathKind)
  if (t.kind === 'melee' || t.kind === 'rays') return meleePigment(L)
  if (t.kind === 'chladni') return chladniPigment(L)
  const [c0, c1] = emitterPigments(L)
  if (t.kind === 'mod') return c1
  if (t.kind === 'motion') return px(c0.h + (MOTION[L.motion]?.dh ?? 0) * 2, c0.s + 6, c0.l + 4)
  if (t.kind === 'fission') return px(c0.h + 60, c0.s, c0.l + 4)
  if (t.kind === 'thorn') return px(c0.h + 120, c0.s, c0.l + 4)
  return c0 // spawner
}

// def.palette is indexed by colour slot: layer i owns slots 2i and 2i+1.
export function buildPalette(layers) {
  const palette = []
  for (const L of layers) {
    if (L.type === 'emitter') {
      const [a, b] = emitterPigments(L)
      palette[2 * L.index] = a
      palette[2 * L.index + 1] = b
    } else {
      const c = L.type === 'chladni' ? chladniPigment(L) : meleePigment(L)
      palette[2 * L.index] = c
      palette[2 * L.index + 1] = c
    }
  }
  for (let i = 0; i < palette.length; i++) if (!palette[i]) palette[i] = px(210, 24, 62)
  return palette
}
