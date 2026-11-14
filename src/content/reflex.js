// How fast a human has to be. The fairness proof says a safe path EXISTS for a player who
// can see the whole pattern in advance. A real player sees a hazard when it is announced and
// has to answer in time, so what separates easy from brutal is the TIME TO ANSWER, not the
// geometry. This module turns that into numbers, so "top difficulty" is a requirement we can
// state and test: the plateau must demand a professional esports player's reflexes, and
// still be physically possible for one.
//
// Human estimates (visual reaction to a simple stimulus, seconds; from reaction-time studies
// and esports measurements: the average adult is ~0.25 s, a keen gamer ~0.20 s, a
// professional ~0.15-0.18 s, and ~0.12 s is the floor that anticipation, not reaction,
// has to cover):
export const HUMAN = {
  average: { name: 'average player', react: 0.25 },
  gamer: { name: 'keen gamer', react: 0.2 },
  pro: { name: 'professional (LoL-level)', react: 0.17 },
  limit: { name: 'human limit', react: 0.12 },
}
// After the decision: key-press to the ship actually changing course (the velocity filter
// reaches 90% in ln(10)/20 = 0.115 s, the first 50% in 0.035 s) and the finger itself.
export const MOTOR = 0.06
// How far a ship usually has to move to leave an announced hazard (px), at P.speed.
export const ESCAPE_PX = 40

import { P } from '../core/config.js'

export const ESCAPE_T = ESCAPE_PX / P.speed // ~0.13 s

// The warning time at which a player of the given reaction time is exactly on the edge:
// react + motor + the time to clear the hazard.
export const teleNeeded = (react) => react + MOTOR + ESCAPE_T

// The slowest reaction (s) that can still answer an announcement of length `tele` by
// reacting alone.
export const reactionAllowed = (tele) => tele - MOTOR - ESCAPE_T

// Which tier a warning time demands.
export function tierOfTele(tele) {
  if (tele >= teleNeeded(HUMAN.average.react)) return 'average'
  if (tele >= teleNeeded(HUMAN.gamer.react)) return 'gamer'
  if (tele >= teleNeeded(HUMAN.pro.react)) return 'pro'
  if (tele >= teleNeeded(HUMAN.limit.react)) return 'limit'
  return 'impossible'
}

// Bullets: one that appears `dist` px from you at `speed` px/s reaches you after dist/speed.
// A pro has to be able to answer a bullet that appears this close to them.
export const BULLET_CLOSE_PX = 140
export const bulletLead = (speed) => BULLET_CLOSE_PX / speed
export const tierOfBulletSpeed = (speed) => {
  const lead = bulletLead(speed)
  if (lead >= teleNeeded(HUMAN.average.react)) return 'average'
  if (lead >= teleNeeded(HUMAN.gamer.react)) return 'gamer'
  if (lead >= teleNeeded(HUMAN.pro.react)) return 'pro'
  if (lead >= teleNeeded(HUMAN.limit.react)) return 'limit'
  return 'impossible'
}

// No bullet is ever faster than a professional can answer at close range: the hard cap of the
// whole game (an emitted bullet, a fission child).
export const BULLET_SPEED_CAP = Math.floor(BULLET_CLOSE_PX / teleNeeded(HUMAN.pro.react))

// What a boss demands: the shortest warning among its attacks and its fastest bullet.
export function reflexOf(def, topSpeed = 0) {
  let tele = Infinity
  for (const L of def.layers) if (L.tele !== undefined) tele = Math.min(tele, L.tele)
  return {
    tele,
    teleTier: tierOfTele(tele),
    reactionAllowed: reactionAllowed(tele),
    topSpeed,
    bulletTier: topSpeed ? tierOfBulletSpeed(topSpeed) : null,
  }
}
