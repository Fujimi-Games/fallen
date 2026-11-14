// Which instrument plays what. The notes still come from the boss's equations;
// this only chooses the voices, from the boss's own seed, so every boss has its own
// ensemble and the same spawner can sound different from one boss to the next.
//   spawner  -> lead melody       path -> bass          modulator -> its rhythm voice
//   motion   -> its colour voice  melee -> percussion
import { mulberry32 } from '../core/rng.js'

// candidates per spawner (the boss picks one, avoiding a repeat of another lead)
export const LEAD = {
  phyllotaxis: ['harp', 'kalimba', 'bell'],
  rose: ['glass', 'bell', 'flute'],
  superformula: ['marimba', 'bell', 'handpan'],
  lissajous: ['kalimba', 'pluck', 'harp'],
  spirograph: ['handpan', 'bowl', 'glass'],
  epicycloid: ['bell', 'glass', 'marimba'],
  hypocycloid: ['pluck', 'harp', 'kalimba'],
  limacon: ['bowl', 'flute', 'glass'],
  koch: ['bell', 'marimba', 'handpan'],
  dragon: ['pluck', 'flute', 'kalimba'],
  frost: ['glass', 'bell', 'harp'],
  petals: ['bell', 'harp', 'handpan'],
  chaos: ['kalimba', 'marimba', 'pluck'],
}

// the boss's path decides the bass
export const BASS = {
  lissajous: ['strings', 'choir'],
  rose: ['bowl', 'choir'],
  lemniscate: ['choir', 'strings'],
  spirograph: ['strings', 'handpan'],
  limacon: ['bowl', 'choir'],
  epicycloid: ['handpan', 'strings'],
  hypocycloid: ['bowl', 'strings'],
  koch: ['choir', 'bowl'],
}

// a modulator's rhythm voice and a motion law's colour voice
export const MOD_VOICE = { spin: ['kalimba', 'marimba'], pendulum: ['flute', 'glass'], pulse: ['handpan', 'marimba'], drift: ['choir', 'strings'] }
export const MOTION_VOICE = { snake: ['flute', 'strings'], curl: ['glass', 'bowl'] }

export function pickEnsemble(def) {
  const r = mulberry32((def.id ^ 0x9e3779b9) | 0)
  const pick = (list) => list[Math.floor(r() * list.length)]
  const taken = new Set()
  const lead = {}
  for (const L of def.layers) {
    if (L.type !== 'emitter') continue
    const list = LEAD[L.spawner] || ['bell', 'pluck']
    const free = list.filter((n) => !taken.has(n))
    const name = pick(free.length ? free : list)
    taken.add(name)
    lead[L.index] = name
  }
  const pathKind = def.traits.some((t) => t.kind === 'path') ? def.path.kind || null : null
  return {
    lead,
    bass: pick(BASS[pathKind] || ['strings', 'bowl']),
    mod: Object.fromEntries(Object.entries(MOD_VOICE).map(([k, v]) => [k, pick(v)])),
    motion: Object.fromEntries(Object.entries(MOTION_VOICE).map(([k, v]) => [k, pick(v)])),
  }
}
