import { mulberry32, range, pick, weighted } from '../core/rng.js'
import { SPAWNERS } from '../content/spawners.js'
import { MOTIONS } from '../content/motions.js'
import { MODS } from '../content/mods.js'
import { BULLET_TRAITS, BULLET_KINDS } from '../content/bullets.js'
import { PATHS, buildPath } from '../content/paths.js'
import { TAU } from '../core/math.js'
import { MELEE } from '../content/melee.js'
import { difficulty, ramp, timing } from '../content/difficulty.js'
import { makeWeakSpots } from '../content/weakspots.js'
import { buildPalette, traitPigment, meleePigment } from '../content/pigments.js'

const f = (v, d = 2) => +v.toFixed(d)

// Scale a motion law's variables by the level's flight/rhythm multipliers.
function scaleMotion(kind, mp, d) {
  if (kind === 'snake') {
    mp.A *= d.flight
    mp.w *= d.rhythm
  } else if (kind === 'curl') mp.w *= d.flight
  else if (kind === 'flow') mp.k *= d.flight
  return mp
}

function scaleMod(kind, p, d) {
  p.w *= d.rhythm
  if (kind === 'pulse') p.a = Math.min(0.45, p.a * d.flight)
  return p
}

function emitterLayer(r, index, spawnerKey, hueA, hueB, level, intensity = 1) {
  const S = SPAWNERS[spawnerKey]
  const motion = weighted(r, { straight: 0.28, snake: 0.2, curl: 0.32, flow: 0.2 })
  const mod = weighted(r, { spin: 0.3, pendulum: 0.25, pulse: 0.2, drift: 0.25 })
  const p = S.make(r)
  const stream = S.kind === 'stream'

  let sym = 1
  if (stream) sym = (S.symMax ? 1 : 2) + Math.floor(r() * (S.symMax || 4))
  const mirror = r() < 0.4
  const twoTone = r() < 0.6

  const d = difficulty(level)
  const speed = (stream ? range(r, 125, 175) : range(r, 150, 200)) * d.bulletSpeed
  const life = 11
  const perTick = stream ? 1 : p.N
  const lifeEff = Math.min(life, 650 / (speed * (stream ? 1 : 0.62)))
  const cap = (stream ? 380 : 450) * (index === 0 ? 1 : 0.85) * d.density

  let rate = p.rate
  const alive = () => rate * perTick * sym * lifeEff
  if (alive() > cap) rate = cap / (perTick * sym * lifeEff)
  while (stream && rate < 12 && sym > 1) {
    sym--
    rate = Math.min(p.rate, cap / (perTick * sym * lifeEff))
  }
  rate = Math.max(rate * intensity * d.fireRate, stream ? 5 : 0.35)

  // an optional bullet trait (fission or thorn): kept or dropped by the trait count
  const btKind = r() < 0.7 ? pick(r, BULLET_KINDS) : null
  const bt = btKind ? { kind: btKind, p: BULLET_TRAITS[btKind].make(r, level) } : null

  const L = {
    type: 'emitter',
    index,
    spawner: spawnerKey,
    motion,
    mp: scaleMotion(motion, MOTIONS[motion].make(r), d),
    mod,
    modP: scaleMod(mod, MODS[mod].make(r), d),
    sym,
    mirror,
    twoTone,
    hue: hueA,
    hue2: hueB,
    rate,
    speed,
    life,
    p,
    curlDir: r() < 0.5 ? -1 : 1,
    bt,
    lifeEff,
  }
  L.info = {
    title: `${S.name}${sym > 1 ? ` × ${sym}${mirror ? ' mirrored' : ''}` : ''}`,
    rows: [
      { k: 'Spawner', name: S.name, tex: S.tex(p) },
      { k: 'Motion', name: MOTIONS[motion].adj, tex: MOTIONS[motion].tex(L.mp) },
      { k: 'Modulator', name: MODS[mod].name, tex: MODS[mod].tex(L.modP) },
      ...(bt ? [{ k: BULLET_TRAITS[bt.kind].label, name: BULLET_TRAITS[bt.kind].name, tex: BULLET_TRAITS[bt.kind].tex(bt.p) }] : []),
    ],
  }
  return L
}

function raysLayer(r, index, hue, level) {
  const d = difficulty(level)
  const ang = Math.min(d.angular, 1.15) // the proof assumes a beam sweeps at most ~0.84 rad/s
  const f1 = range(r, 0.5, 0.9)
  const ratio = pick(r, [1.5, 2, 2.5, 3, 4 / 3])
  const L = {
    type: 'rays',
    index,
    hue,
    count: pick(r, [1, 2, 3, 3]),
    spread: range(r, 0.55, 1.0),
    cross: r() < 0.4,
    f1,
    f2: f1 * ratio,
    A1: (0.28 * ang) / f1,
    A2: (0.15 * ang) / (f1 * ratio),
    ph1: r() * TAU,
    ph2: r() * TAU,
    drift: (r() - 0.5) * 0.1,
    ...timing(d, 1.5, 1.0),
    on: 3.6 * d.uptime,
    fade: 0.5,
    width: 13 * d.width,
  }
  L.T = L.rest + L.tele + L.on + L.fade
  L.info = {
    title: `Harmonograph ×${L.count}`,
    rows: [
      { k: 'Delivery', name: 'Harmonograph ray', tex: `θ(t) = ${f(L.A1)}·sin(${f(L.f1)}t) + ${f(L.A2)}·sin(${f(L.f2)}t)` },
      { k: 'Rhythm', name: 'Telegraph → fire', tex: `${f(L.tele, 1)}s warning · ${f(L.on, 1)}s beam` },
    ],
  }
  return L
}


function meleeLayer(r, index, hue, avoid, level) {
  const d = difficulty(level)
  const kinds = Object.keys(MELEE).filter((k) => k !== avoid)
  const kind = pick(r, kinds)
  const mp = MELEE[kind].make(r, { tip: d.tip, ang: d.angular })
  const L = {
    type: 'melee',
    index,
    melee: kind,
    mp,
    hue,
    scale: d.reach,
    ...timing(d, 0.9, 0.8),
    on: (kind === 'sweep' ? 2.4 : 3.4) * d.uptime,
    fade: 0.4,
  }
  L.T = L.rest + L.tele + L.on + L.fade
  L.info = {
    title: MELEE[kind].name,
    rows: [{ k: 'Melee', name: MELEE[kind].name, tex: MELEE[kind].tex(mp) }],
  }
  return L
}

function chladniLayer(r, index, hue, level) {
  const d = difficulty(level)
  const L = {
    type: 'chladni',
    index,
    hue,
    ...timing(d, 1.8, 2.0),
    on: 4.2 * d.uptime,
    fade: 0.6,
    thr: d.lane,
  }
  L.T = L.rest + L.tele + L.on + L.fade
  L.info = {
    title: 'Chladni plate',
    rows: [
      { k: 'Delivery', name: 'Standing wave', tex: 'cos(nπx)cos(mπy) − cos(mπx)cos(nπy)' },
      { k: 'Rule', name: 'Stand on the nodal lines', tex: `|f(x,y)| < ${f(L.thr)}  is safe` },
    ],
  }
  return L
}


const KIND_LABEL = { fission: 'Offspring', thorn: 'Thorns', spawner: 'Spawner', motion: 'Motion', mod: 'Modulator', rays: 'Laser', chladni: 'Delivery', melee: 'Melee', path: 'Movement' }
const KIND_CAT = { fission: 'ranged', thorn: 'ranged', spawner: 'ranged', motion: 'ranged', mod: 'ranged', rays: 'melee', chladni: 'ranged', melee: 'melee', path: 'movement' }

// Trait count and durability follow the same ramp as every other variable, then
// plateau: from RAMP_LEVELS wins on a boss always has 9 traits of 340 durability
// each, so the late game is a long fight at constant difficulty, not a rising one.
//   traits   N(L)  = 3 + round(6·u(L))        (3 -> 9)
//   per-trait HP   = 150 + 190·u(L)           (150 -> 340)
export function progression(level) {
  const u = ramp(level)
  return {
    n: 3 + Math.round(6 * u),
    hpPer: Math.round(150 + 190 * u),
  }
}

// Order in which traits are added to a boss as N grows. Traits beyond N do not
// exist at all: a layer with no kept trait is dropped, and an attack without its
// modulator or motion trait simply has none.
function unlockSequence(layers) {
  const seq = [
    { kind: 'spawner', layer: 0 },
    { kind: layers[1].type === 'rays' ? 'rays' : 'melee', layer: 1 },
    { kind: 'path', layer: -1 },
    { kind: 'mod', layer: 0 },
    { kind: 'motion', layer: 0 },
    ...(layers[0].bt ? [{ kind: layers[0].bt.kind, layer: 0 }] : []),
  ]
  for (let i = 2; i < layers.length; i++) {
    const L = layers[i]
    seq.push({ kind: L.type === 'emitter' ? 'spawner' : L.type, layer: i })
    if (L.type === 'emitter') {
      seq.push({ kind: 'mod', layer: i }, { kind: 'motion', layer: i })
      if (L.bt) seq.push({ kind: L.bt.kind, layer: i })
    }
  }
  return seq
}

// The boss is a list of removable traits. Each has its own durability, so
// stripping one takes a variable amount of time. Within an emitter the order is
// fixed (rhythm, then flight, then spawner) because losing the spawner ends the
// whole attack; across layers the order is shuffled.
function buildTraits(r, layers, keep, pathKind, path, totalHp, hpPer) {
  const ORDER = { mod: 0, motion: 1, fission: 1.5, thorn: 1.5 }
  // Strip order: ranged traits first (shuffled across layers, rhythm -> flight ->
  // spawner within an attack), then the movement path, and the melee traits
  // (melee layers and lasers) LAST. A boss with no melee could be camped on
  // top of indefinitely, so its melee must outlive everything else.
  const isMeleeCat = (k, L) => k === 'melee' || k === 'rays'
  const pool = layers.map((L, i) => ({
    i,
    q: keep
      .filter((k) => k.layer === i && !isMeleeCat(k.kind))
      .sort((x, y) => (ORDER[x.kind] ?? 2) - (ORDER[y.kind] ?? 2))
      .map((k) => k.kind),
  }))
  const items = []
  while (pool.some((p) => p.q.length)) {
    const live = pool.filter((p) => p.q.length)
    const p = live[Math.floor(r() * live.length)]
    items.push({ kind: p.q.shift(), layer: p.i })
  }
  items.push({ kind: 'path', layer: -1 })
  const meleeItems = keep.filter((k) => isMeleeCat(k.kind)).map((k) => ({ kind: k.kind, layer: k.layer }))
  for (let i = meleeItems.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[meleeItems[i], meleeItems[j]] = [meleeItems[j], meleeItems[i]]
  }
  items.push(...meleeItems)

  const w = items.map(() => 0.55 + r() * 1.6)
  const sum = w.reduce((a, b) => a + b, 0)
  return items.map((it, id) => {
    const L = layers[it.layer]
    let name
    let tex
    let on = ''
    if (it.kind === 'spawner') {
      name = SPAWNERS[L.spawner].name
      tex = SPAWNERS[L.spawner].tex(L.p)
    } else if (it.kind === 'motion') {
      name = MOTIONS[L.motion].adj
      tex = MOTIONS[L.motion].tex(L.mp)
      on = SPAWNERS[L.spawner].name
    } else if (it.kind === 'fission' || it.kind === 'thorn') {
      name = BULLET_TRAITS[it.kind].name
      tex = BULLET_TRAITS[it.kind].tex(L.bt.p)
      on = SPAWNERS[L.spawner].name
    } else if (it.kind === 'mod') {
      name = MODS[L.mod].name
      tex = MODS[L.mod].tex(L.modP)
      on = SPAWNERS[L.spawner].name
    } else if (it.kind === 'path') {
      name = PATHS[pathKind].name
      tex = `${PATHS[pathKind].tex(path.p)} · peak ${Math.round(path.peak)} px/s`
    } else {
      name = L.info.rows[0].name
      tex = L.info.rows[0].tex
    }
    return {
      id,
      kind: it.kind,
      cat: KIND_CAT[it.kind],
      layer: it.layer,
      label: KIND_LABEL[it.kind],
      name,
      tex,
      on,
      hp: Math.max(30, Math.round((totalHp * w[id]) / sum)),
    }
  })
}

const NAME = {
  spawner: { phyllotaxis: 'Sunflower', rose: 'Rose', superformula: 'Star', lissajous: 'Weaver', spirograph: 'Orbit', epicycloid: 'Bloom', hypocycloid: 'Astroid', limacon: 'Cardioid', koch: 'Snowflake', dragon: 'Dragon', frost: 'Frost', petals: 'Petals', chaos: 'Gasket' },
  motion: { straight: 'Radiant', snake: 'Serpentine', curl: 'Whirling', flow: 'Drifting' },
  tail: { rays: 'of Harmonics', chladni: 'of Sand', emitter: 'of Echoes', melee: 'of Thorns' },
}

export function generateBoss(seed, level = 0, intensity = 1) {
  const r = mulberry32(seed)

  const used = new Set()
  const pickSpawner = () => {
    const keys = Object.keys(SPAWNERS).filter((k) => !used.has(k))
    const k = pick(r, keys)
    used.add(k)
    return k
  }

  const layers = []
  layers.push(emitterLayer(r, 0, pickSpawner(), 0, 1, level, intensity))

  // Build every candidate layer, then keep only as many traits as this level
  // earns: a ranged primary, a melee layer, then two layers of any kind.
  // A boss has exactly ONE melee-category trait: a melee shape or a laser (lasers
  // count as melee). It is always the last to fall. Every other layer is ranged.
  layers.push(r() < 0.7 ? meleeLayer(r, 1, 2, null, level) : raysLayer(r, 1, 2, level))
  const usedTypes = new Set()
  for (let i = 2; i < 4; i++) {
    let t = weighted(r, { emitter: 1.4, chladni: 1 })
    if (t !== 'emitter' && usedTypes.has(t)) t = 'emitter'
    usedTypes.add(t)
    if (t === 'emitter') layers.push(emitterLayer(r, i, pickSpawner(), r() < 0.5 ? 1 : 0, 2, level, intensity))
    else layers.push(chladniLayer(r, i, 2, level))
  }

  // prune to the level's trait count
  const { n, hpPer } = progression(level)
  const keep = unlockSequence(layers).slice(0, n)
  const keptLayers = []
  const remap = new Map()
  layers.forEach((L, i) => {
    if (keep.some((k) => k.layer === i)) {
      remap.set(i, keptLayers.length)
      if (L.type === 'emitter') {
        if (!keep.some((k) => k.layer === i && k.kind === 'mod')) L.mod = null
        if (!keep.some((k) => k.layer === i && k.kind === 'motion')) L.motion = null
        if (L.bt && !keep.some((k) => k.layer === i && k.kind === L.bt.kind)) L.bt = null
        else if (L.bt && L.bt.kind === 'fission') {
          // children multiply the bullets alive: slow the spawner so the total stays at its cap
          const ts = Math.min(L.bt.p.delay, L.lifeEff)
          L.rate = Math.max(L.rate * (L.lifeEff / (ts + L.bt.p.n * (L.lifeEff - ts))), 0.35)
        }
      }
      L.index = keptLayers.length
      keptLayers.push(L)
    }
  })
  const keepMapped = keep.map((k) => ({ kind: k.kind, layer: k.layer < 0 ? -1 : remap.get(k.layer) }))
  layers.length = 0
  layers.push(...keptLayers)

  // body: superformula silhouette (n2 = n3 so any integer m closes)
  const bm = 3 + Math.floor(r() * 6)
  const bn1 = range(r, 0.55, 1.6)
  const bn = range(r, 0.8, 3)
  const body = []
  let mx = 0
  const raw = []
  for (let i = 0; i < 160; i++) {
    const th = (TAU * i) / 160
    const x = (bm * th) / 4
    const rr = Math.pow(Math.pow(Math.abs(Math.cos(x)), bn) + Math.pow(Math.abs(Math.sin(x)), bn), -1 / bn1)
    raw.push([th, rr])
    if (rr > mx) mx = rr
  }
  for (const [th, rr] of raw) body.push([Math.cos(th) * (rr / mx), Math.sin(th) * (rr / mx)])

  const pathKind = pick(r, Object.keys(PATHS))
  const path = buildPath(pathKind, PATHS[pathKind].make(r), r() * TAU, undefined, undefined, difficulty(level).pathSpeed)

  const tail = layers[layers.length - 1].type
  const name = `${NAME.motion[layers[0].motion || 'straight']} ${NAME.spawner[layers[0].spawner]} ${NAME.tail[tail]}`

  const totalHp = Math.round(n * hpPer * range(r, 0.92, 1.08))
  const traits = buildTraits(r, layers, keepMapped, pathKind, path, totalHp, hpPer)

  // Colour comes from the traits: each layer owns two palette slots, every trait
  // gets the pigment of its equation (see content/pigments.js).
  for (const L of layers) {
    L.hue = 2 * L.index
    if (L.type === 'emitter') L.hue2 = L.hue + 1
  }
  const palette = buildPalette(layers)
  for (const t of traits) t.color = traitPigment(t, layers[t.layer], pathKind)
  const meleeL = layers.find((l) => l.type === 'melee' || l.type === 'rays')
  const hues2 = [palette[0].h, palette[1].h, meleePigment(meleeL).h]

  return {
    id: seed,
    level,
    difficulty: difficulty(level),
    intensity,
    code: (seed >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6),
    name,
    hues: hues2,
    palette,
    slotHues: palette.map((c) => c.h),
    layers,
    body,
    bodyInfo: `r = (|cos(${bm}θ/4)|^${f(bn, 1)} + |sin(${bm}θ/4)|^${f(bn, 1)})^(−1/${f(bn1)})`,
    traits,
    // the last remaining trait is brief (see Game.severTrait)
    briefHp: Math.max(8, Math.round(hpPer * 0.08)),
    hp: traits.reduce((a, t) => a + t.hp, 0),
    path,
    pathInfo: { name: PATHS[pathKind].name, tex: PATHS[pathKind].tex(path.p), speed: Math.round(path.peak) },
    spin: (r() < 0.5 ? -1 : 1) * range(r, 0.2, 0.5),
    weak: makeWeakSpots(seed, traits), // the orbit trait and the spots of every stage
  }
}
