export const W = 540
export const H = 960
export const STEP = 1 / 120
export const BOSS_Y = 210
export const BOSS_R = 46
export const INTRO_T = 2.6

// Player constants. The fairness verifier reads these too, so the proof is
// always about the same player the game actually simulates.
export const P = { speed: 300, focus: 130, r: 3.4, hp: 3, fireRate: 12, bspeed: 1100 }
export const BULLET_R = 3.4
// A melee hit on the boss stuns it for a fraction of a second (its clock stops), then it is
// immune to stun for a while, so melee cannot chain-lock it.
export const MELEE_STUN = { time: 0.2, cooldown: 0.6 }
export const PB_R = 2.6 // radius of a player's bullet
export const PB_R_CENTRE = 3.2 // the central stream is slightly thicker...
export const CENTRE_DMG = 3 // ...and hits three times as hard as a wing stream
export const THORN_R = 5 // radius of the satellite a thorned bullet carries
