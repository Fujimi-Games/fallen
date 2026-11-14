// Keyboard and mouse state. WASD moves, Shift focuses; the mouse only aims, and only in hard
// mode (in normal mode the player always faces the boss). Owns the DOM listeners; the game only reads state and
// receives `onPress(key)` / `onPointer()` (a click anywhere, only to unlock audio). Without attach() it is a
// plain object, so tests can set `keys` directly.
import { W, H } from '../core/config.js'
import { ALIASES, defaults } from './bindings.js'

export class Input {
  constructor() {
    this.keys = new Set()
    this.bindings = defaults()
    this.capture = null // (key) => void while the Settings panel waits for a key: nothing else sees it
    this.mouse = { x: W / 2, y: H / 3, seen: false }
    this.onPress = null // (key) => void, key is lower-case, no repeats
    this.onPointer = null // () => void, any click (audio unlock only)
    this.onBlur = null
    this.off = []
  }

  setBindings(b) {
    this.bindings = b
  }

  // is the key of this ACTION held? (arrow keys and P are always aliases of their actions)
  down(action) {
    if (this.keys.has(this.bindings[action])) return true
    for (const k of ALIASES[action] || []) if (this.keys.has(k)) return true
    return false
  }

  // -1..1 on each axis from the movement actions
  axis() {
    return {
      x: (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0),
      y: (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0),
    }
  }

  attach(canvas, win = window) {
    const on = (target, type, fn) => {
      target.addEventListener(type, fn)
      this.off.push(() => target.removeEventListener(type, fn))
    }
    on(win, 'keydown', (e) => {
      const k = e.key.toLowerCase()
      if (this.capture) {
        e.preventDefault()
        if (!e.repeat) this.capture(k)
        return
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if (e.repeat) return
      this.keys.add(k)
      this.onPress?.(k)
    })
    on(win, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    on(win, 'mousemove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.mouse.x = ((e.clientX - r.left) / r.width) * W
      this.mouse.y = ((e.clientY - r.top) / r.height) * H
      this.mouse.seen = true
    })
    on(win, 'pointerdown', () => this.onPointer?.()) // any click: the first one unlocks the audio
    on(win, 'blur', () => {
      this.keys.clear()
      this.onBlur?.()
    })
  }

  detach() {
    for (const f of this.off) f()
    this.off = []
  }
}
