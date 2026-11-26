// The store page (Game Listing) shared by Danboru, Shing and the Fujimi site. Only a
// publish with the production app key changes it.
//
// Source: the Fujimi site's data/games.json has no entry for Fallen (checked
// 2026-11-26), so every line below is taken from the game itself: the menu, the
// Record and Dossier panels, ARCHITECTURE.md and src/content. The media in
// metaru/store/ are captured from the running game by metaru/capture.mjs.
// Links are left out: the game has no public store, itch.io or website page yet.
export const LISTING = {
  pitch: 'A boss-rush shooter where every boss is built from mathematical curves, checked for fairness before you meet it, and leaves you one of its traits when it falls.',
  status: 'In development',
  description: [
    'Fallen is a boss rush under an old star chart. Each boss is generated from a seed: its attacks are equations (rose curves, Lissajous figures, superformulas, hypotrochoids, Koch snowflakes, Heighway dragons) wound into muzzles, flight paths, rhythms and melee shapes.',
    'Before a boss reaches you, the game tries to prove it can be survived: a fairness search plays the fight ahead of time and checks that safe space remains at every moment. The boss dossier shows the proof, or says when only a best effort was found.',
    'Hits wear down the boss’s traits one at a time, ranged first and melee last. When only its melee trait is left it enters Fury at two to almost three times the tempo; when none is left it is purified and a few hits finish it.',
    'Every boss you defeat leaves you one of its traits. Inherited muzzles, flight laws, rhythms, shots and melee shapes merge into your own gun, and each one is also a life: a hit strips an inherited trait first, then one of your three streams.',
    'Difficulty starts slow, ramps quickly, and from the twelfth win holds at a plateau set against professional reaction times. The music is generated from the boss’s own equations.',
  ].join('\n\n'),
  features: [
    'Procedurally generated bosses, each built from mathematical curves and identified by its seed',
    'A fairness search for every boss before you fight it, shown in the boss dossier',
    'Inherit a trait from every boss you defeat: muzzle, flight, rhythm, shot or melee',
    'Inherited traits merge into your gun and double as extra lives',
    'Boss phases: assault, then Fury at two to almost three times the tempo, then a brief finish',
    'Normal mode faces the boss for you; Hard mode aims with the mouse',
    'Automatic melee that swings on the beat and cuts bullets',
    'Music generated from harmonic series, golden-ratio walks, Euclid rhythms and the logistic map',
  ],
  tags: ['roguelite'],
  platforms: ['web'],
  cover: 'store/cover.jpg',
  screenshots: ['store/assault.jpg', 'store/purified.jpg', 'store/boss_intro.jpg', 'store/boss_down.jpg'],
  video: { file: 'store/trailer.mp4' },
}
