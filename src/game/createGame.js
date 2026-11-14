// Composition root for the browser: builds every collaborator once and wires
// them together. This is the only place that knows about all of them.
import { Game } from './Game.js'
import { Input } from './Input.js'
import { Loop } from './Loop.js'
import { Emitter } from '../core/events.js'
import { Store } from '../core/storage.js'
import { Music } from '../audio/Music.js'
import { Renderer } from '../render/Renderer.js'
import { StateLog, fmt } from './StateLog.js'
import { requestFairBoss, resetFairWorker } from '../fairness/client.js'

export function createGame(canvas, onHud) {
  const store = new Store()
  const events = new Emitter()
  const input = new Input()
  const music = new Music(store)
  const renderer = new Renderer(canvas)
  // flight recorder: every boss/player state change, trait loss and phase, to the console
  // (info; the 5-second snapshots are debug, so turn on Verbose to see them). In dev,
  // copy(__fallen.log.records) puts the whole recording on the clipboard and kept in `log.records` for inspection
  const log = new StateLog((r) => (r.tag === 'snap' ? console.debug : console.info)(fmt(r)), { every: 5 })
  const game = new Game({ store, events, audio: music, input, fairClient: { request: requestFairBoss, reset: resetFairWorker }, onHud, log })
  if (import.meta.env && import.meta.env.DEV) globalThis.__fallen = { game, log }

  const offAudio = music.attach(events)
  // a log line per boss, so a strange one can be reported by its seed
  events.on('boss', ({ def }) => {
    const melee = def.traits.filter((t) => t.cat === 'melee').length
    const line = `[boss] seed ${def.code} · level ${def.level} · ${def.name} · traits: ${def.traits.map((t) => `${t.kind}(${t.hp})`).join(' > ')} · fairness ${def.fairness ? (def.fairness.forced ? 'best effort' : 'proven') : 'none'}`
    if (melee !== 1) console.warn(`${line} · UNEXPECTED: ${melee} melee traits`)
    else console.info(line)
  })
  input.attach(canvas)

  let hudT = 0
  const loop = new Loop({
    update: (dt) => game.update(dt),
    paused: () => game.paused,
    frame: (dt) => {
      if (!game.paused) music.update(game)
      renderer.render(game)
      hudT += dt
      if (hudT > 0.1) {
        hudT = 0
        game.emitHud()
      }
    },
  })

  return {
    game,
    log,
    start() {
      loop.start()
      game.emitHud()
    },
    destroy() {
      loop.stop()
      input.detach()
      offAudio()
      renderer.destroy()
      game.destroy()
    },
  }
}
