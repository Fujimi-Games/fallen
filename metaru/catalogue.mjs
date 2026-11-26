// What FALLEN declares to Danboru, built from the game's own tables so names never drift:
// resources (the boss traits a player can inherit), achievements and avatars.
// metaru/manifest.mjs publishes it; metaru/art.mjs draws the images it names.
import { SPAWNERS } from '../src/content/spawners.js'
import { MOTIONS } from '../src/content/motions.js'
import { MODS } from '../src/content/mods.js'
import { BULLET_TRAITS } from '../src/content/bullets.js'
import { MELEE } from '../src/content/melee.js'
import { RAMP_LEVELS } from '../src/content/difficulty.js'

/* ------------------------------------------ resources ------------------------------------------ */
// One resource per inheritable trait (src/game/arsenal.js): the only things a player
// receives in FALLEN. Slot words and merge rules are the ones the Arsenal panel shows
// (src/ui/Record.jsx). Keys: <slot>.<trait key>, never change.
const SLOTS = [
  ['muzzle', SPAWNERS, 'Muzzle trait: where your shots leave from. Inherited muzzle angles and offsets add.'],
  ['flight', MOTIONS, 'Flight trait: the path your bullets take. Inherited headings add.'],
  ['rhythm', MODS, 'Rhythm trait: how your gun breathes. Rotations add; spread, rate and speed multiply.'],
  ['shot', BULLET_TRAITS, 'Shot trait: what your bullets do in flight (split or orbit).'],
  ['melee', MELEE, 'Melee shape: swings on the beat around you. Every inherited shape swings at once, on top of the base slash.'],
]
// two muzzle traits reuse a curve's name; the game tells them apart by their noun
const nameOf = (slot, key, T) => {
  if (slot === 'flight') return `${T.adj} flight`
  if (slot === 'muzzle' && (key === 'frost' || key === 'petals')) return `${T.noun} (${T.name})`
  if (slot === 'melee' && SPAWNERS[key]) return `${T.name} blade`
  return T.name
}
// which glyph metaru/art.mjs draws for a trait
const glyphOf = (slot, key) => (slot !== 'melee' ? key : key === 'pulse' ? 'shockwave' : SPAWNERS[key] ? 'melee_' + key : key)

export const RESOURCES = []
export const RESOURCE_ART = []
for (const [slot, table, description] of SLOTS)
  for (const key of Object.keys(table)) {
    const file = `trait_${slot}_${key}.png`
    RESOURCES.push({ key: `${slot}.${key}`, display_name: nameOf(slot, key, table[key]), description, stackable: false, image: `images/${file}` })
    RESOURCE_ART.push([file, glyphOf(slot, key)])
  }

/* ------------------------------------------- events -------------------------------------------- */
// What the game sends with Danboru.track (src/platform/danboru.js). Achievement rules read these.
export const EVENTS = [
  { key: 'run_started', display_name: 'Run started', description: 'A run begins (Play, or a new run after falling or restarting).', properties: { aim_mode: 'string' } },
  { key: 'boss_defeated', display_name: 'Boss defeated', description: 'A boss falls.', properties: { bosses_in_run: 'integer', flawless: 'boolean', aim_mode: 'string', run_score: 'integer', fairness: 'string' } },
  { key: 'trait_severed', display_name: 'Trait severed', description: 'A boss loses a trait.', properties: { category: 'string', trait: 'string' } },
  { key: 'weak_spot_broken', display_name: 'Weak spot broken', description: 'A weak spot (planet) on the boss breaks.', properties: {} },
  { key: 'phase_entered', display_name: 'Phase entered', description: 'The boss changes phase (fury, bare).', properties: { phase: 'string' } },
  { key: 'trait_inherited', display_name: 'Trait inherited', description: 'The player inherits a trait from a fallen boss.', properties: { slot: 'string', trait: 'string', result: 'string' } },
  { key: 'player_hit', display_name: 'Player hit', description: 'The player is hit and loses a trait or a stream.', properties: { lives_left: 'integer' } },
  { key: 'run_ended', display_name: 'Run ended', description: 'A run ends: the player fell, or abandoned it with Restart.', properties: { reason: 'string', bosses_in_run: 'integer', run_score: 'integer', aim_mode: 'string' } },
]

/* ----------------------------------------- achievements ----------------------------------------- */
// All `check: "rule"`: Metaru unlocks them from the events above. Points add up to 675 of 1000.
const won = (target, where) => ({ event: 'boss_defeated', measure: 'count', target, ...(where ? { where } : {}) })
const A = [
  // key, name, description, points, rule, glyph, beads, avatar
  ['first_fall', 'First to Fall', 'Defeat your first boss.', 10, won(1), 'rose', 1, 'crescent'],
  ['ten_fallen', 'Ten Sepulchres', 'Defeat 10 bosses.', 25, won(10), 'phyllotaxis', 2],
  ['hundred_fallen', 'Enemies’ Sepulchre', 'Defeat 100 bosses.', 75, won(100), 'spirograph', 3, 'spirograph'],
  ['flawless', 'Flawless', 'Defeat a boss without being hit.', 25, won(1, [{ property: 'flawless', op: 'eq', value: true }]), 'thorn', 1],
  ['flawless_25', 'Untouched', 'Defeat 25 bosses without being hit.', 75, won(25, [{ property: 'flawless', op: 'eq', value: true }]), 'rosette', 3, 'rosette'],
  ['hard_win', 'By Your Own Hand', 'Defeat a boss on Hard, aiming with the mouse.', 25, won(1, [{ property: 'aim_mode', op: 'eq', value: 'hard' }]), 'lissajous', 1, 'lissajous'],
  ['run_five', 'Five in a Row', 'Defeat 5 bosses in one run.', 40, won(1, [{ property: 'bosses_in_run', op: 'gte', value: 5 }]), 'epicycloid', 2],
  ['plateau', 'The Plateau', `Defeat ${RAMP_LEVELS} bosses in one run, where the difficulty stops rising.`, 100, won(1, [{ property: 'bosses_in_run', op: 'gte', value: RAMP_LEVELS }]), 'superformula', 3, 'superformula'],
  ['plateau_hard', 'Orrery', `Defeat ${RAMP_LEVELS} bosses in one run on Hard.`, 150, won(1, [{ property: 'bosses_in_run', op: 'gte', value: RAMP_LEVELS }, { property: 'aim_mode', op: 'eq', value: 'hard' }]), 'hilbert', 4],
  ['severed_100', 'Severance', 'Sever 100 boss traits.', 30, { event: 'trait_severed', measure: 'count', target: 100 }, 'sweep', 2],
  ['spots_250', 'Fallen Planets', 'Break 250 weak spots.', 30, { event: 'weak_spot_broken', measure: 'count', target: 250 }, 'chaos', 2],
  ['mastery', 'Mastery', 'Upgrade an inherited trait 10 times by inheriting a stronger copy.', 30, { event: 'trait_inherited', measure: 'count', target: 10, where: [{ property: 'result', op: 'eq', value: 'upgrade' }] }, 'pulse', 2],
  ['million', 'A Million Points', 'Score 1,000,000 points across all your runs.', 50, { event: 'run_ended', measure: 'sum', property: 'run_score', target: 1000000 }, 'logspiral', 3],
  ['fallen_10', 'Fallen', 'Fall 10 times.', 10, { event: 'run_ended', measure: 'count', target: 10, where: [{ property: 'reason', op: 'eq', value: 'fell' }] }, 'drift', 1],
]
export const AVATARS = []
export const AVATAR_ART = []
export const ACHIEVEMENT_ART = []
export const ACHIEVEMENTS = A.map(([key, display_name, description, points, rule, glyph, beads, avatar]) => {
  const file = `achievement_${key}.png`
  ACHIEVEMENT_ART.push([file, { glyph, beads }])
  const a = { key, display_name, description, points, check: 'rule', rule, image: `images/${file}` }
  if (avatar) {
    const vkey = `avatar_${key}`
    AVATARS.push({ key: vkey, display_name: display_name, image: `images/${vkey}.png`, unlock: 'achievement' })
    AVATAR_ART.push([`${vkey}.png`, { glyph: avatar }])
    a.avatar = vkey
  }
  return a
})
