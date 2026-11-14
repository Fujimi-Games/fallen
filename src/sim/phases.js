// Boss phases are data. Phases are ordered; a boss only ever moves forward through
// them. `when(boss)` says the phase has begun. `pace` is the boss clock rate as a
// function of the player's distance d (geometry, not a constant):
//     rate(d) = far + (near - far) * (1 - S((d - r0) / (r1 - r0)))      S = smoothstep
// so hugging the boss makes every equation, path and melee shape run faster, and
// staying away lets it relax to `far`. Add a phase by appending an entry.
import { smooth } from '../core/math.js'

export const PHASES = [
  { id: 'assault', label: 'Assault', pace: { far: 1, near: 1.3, r0: 140, r1: 380 }, when: () => true },
  {
    id: 'fury',
    label: 'Fury',
    pace: { far: 2, near: 2.8, r0: 140, r1: 380 },
    // the boss hunts the player: it walks toward them at `speed` px/s (times the pace)
    // until it is `keep` px away, close enough for its melee to reach
    chase: { speed: 70, keep: 70 },
    banner: { text: 'FURY', sub: 'last trait · it hunts you', tone: 'red' },
    // one trait left, not counting the flight path (movement is not an attack): it is the
    // melee. Fury suspends the path: the boss stops flying it and hunts the player instead
    // (the path trait stays on the sheet but is never a target and never counts again).
    when: (b) => {
      const rest = b.def.traits.filter((t, i) => !b.gone[i] && t.cat !== 'movement')
      return rest.length === 1 && rest[0].cat === 'melee'
    },
  },
  {
    // no attacking trait left (only a suspended path, if any): nothing attacks any more, a few hits finish the boss off
    id: 'bare',
    label: 'Purified',
    pace: { far: 1, near: 1, r0: 140, r1: 380 },
    banner: { text: 'PURIFIED', sub: 'no traits left · finish it', tone: 'gold' },
    when: (b) => b.def.traits.every((t, i) => b.gone[i] || t.cat === 'movement'),
  },
]

// clock rate of a phase when the player is d pixels away
export function paceAt(pace, d) {
  return pace.far + (pace.near - pace.far) * (1 - smooth(pace.r0, pace.r1, d))
}
