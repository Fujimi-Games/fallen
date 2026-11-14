// Registry of attack-layer behaviours, keyed by the layer type in a boss
// definition. A behaviour implements:
//   update(world, R, dt, ctx)   advance one layer (dt is already phase-scaled)
//   hits(world, R, x, y, r)     optional: does a disc touch this layer's hazard?
//   cuts(world, R, x, y, r)     optional: does it destroy a player bullet there?
//   pressure(R)                 optional: factor (<=1) that slows the emitters
// Adding a new kind of attack = write a behaviour and register it here (and give
// the fairness proof a marker for it in fairness/marks.js).
import { emitterLayer } from './emitter.js'
import { raysLayer } from './rays.js'
import { meleeLayer } from './melee.js'
import { chladniLayer } from './chladni.js'

export const LAYERS = {}
for (const b of [emitterLayer, raysLayer, meleeLayer, chladniLayer]) LAYERS[b.type] = b
