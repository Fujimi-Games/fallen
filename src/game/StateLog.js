// A flight recorder: every state change of the boss and the player, as plain
// objects. No DOM and no console here; it takes a sink so the browser prints it,
// tests read it and headless scripts dump it.
//
//   const log = new StateLog((rec) => console.debug(fmt(rec)))
//   game = new Game({ ..., log })          // Game calls log.tick(game) every step
//
// A record is { t, tag, ... }. Tags: boss, mode, trait, phase, sever, hit, lose, win,
// tempo (when the pace moves noticeably), snap (a periodic full snapshot).
export class StateLog {
  constructor(sink = null, { every = 2 } = {}) {
    this.sink = sink
    this.every = every // seconds between full snapshots
    this.records = []
    this.last = null
    this.nextSnap = 0
  }

  emit(game, tag, extra = {}) {
    const rec = { t: +game.t.toFixed(3), tag, ...extra }
    this.records.push(rec)
    if (this.records.length > 5000) this.records.shift()
    if (this.sink) this.sink(rec)
    return rec
  }

  attach(game) {
    const ev = game.events
    ev.on('boss', ({ def }) => this.emit(game, 'boss', { name: def.name, seed: def.code, level: def.level, traits: def.traits.map((t, i) => `${i}:${t.kind}/${t.cat}(${t.hp})`) }))
    ev.on('sever', ({ trait }) => this.emit(game, 'sever', { trait: `${trait.kind}/${trait.cat}`, ...this.boss(game) }))
    ev.on('phase', ({ phase }) => this.emit(game, 'phase', { phase: phase.id, ...this.boss(game) }))
    ev.on('hit', () => this.emit(game, 'hit', this.player(game)))
    ev.on('lose', () => this.emit(game, 'lose', this.player(game)))
    ev.on('planet', ({ trait }) => this.emit(game, 'planet', { trait: `${trait.kind}/${trait.cat}`, ...this.boss(game) }))
    ev.on('win', () => this.emit(game, 'win', this.boss(game)))
  }

  boss(game) {
    const b = game.boss
    if (!b) return {}
    const traits = b.def.traits
    return {
      phase: b.phase.id,
      left: b.left,
      standing: traits.map((t, i) => (b.gone[i] ? null : `${i}:${t.kind}/${t.cat}:${Math.max(0, Math.round(b.tHp[i]))}/${t.hp}`)).filter(Boolean),
      spots: b.currentTrait() >= 0 ? b.spots[b.currentTrait()].map((h, j) => `${j}:${Math.max(0, Math.round(h))}/${b.def.weak.stages[b.currentTrait()][j].hp}`) : [],
      tempo: +b.tempo.toFixed(2),
      stagger: +Math.max(0, b.stagger).toFixed(2),
      finishHp: b.finishHp,
      pos: [Math.round(b.x), Math.round(b.y)],
      frozen: !!b.frozen,
      layers: b.layers.map((R) => `${R.L.type}:${R.off ? 'off' : R.vis.stage}`),
    }
  }

  player(game) {
    const p = game.player
    if (!p) return {}
    return { pos: [Math.round(p.x), Math.round(p.y)], lives: game.lifeCount(), streams: p.streams, inv: +p.inv.toFixed(2), alive: p.alive }
  }

  // call once per simulation step
  tick(game) {
    const cur = { mode: game.mode, phase: game.boss ? game.boss.phase.id : null, left: game.boss ? game.boss.left : null }
    if (!this.last || cur.mode !== this.last.mode) this.emit(game, 'mode', { mode: cur.mode, ...this.boss(game), player: this.player(game) })
    else if (cur.phase !== this.last.phase || cur.left !== this.last.left) this.emit(game, 'trait', { ...this.boss(game), player: this.player(game) })
    this.last = cur
    if (game.t >= this.nextSnap) {
      this.nextSnap = game.t + this.every
      this.emit(game, 'snap', { mode: game.mode, boss: this.boss(game), player: this.player(game) })
    }
  }
}

export const fmt = (r) => {
  const { t, tag, ...rest } = r
  return `[${t.toFixed(2)}s] ${tag} ${JSON.stringify(rest)}`
}
