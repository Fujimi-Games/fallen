// Trait kinds that hang off a spawner and fall with it.
export const SPAWNER_DEPENDENTS = ['mod', 'motion', 'fission', 'thorn']
export const isBulletTrait = (kind) => kind === 'fission' || kind === 'thorn'
