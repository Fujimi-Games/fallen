// Rebindable controls. An action is bound to one key (movement also answers to the arrow keys,
// always). Pure data and functions: the Settings panel edits a map, Input reads it.
export const ACTIONS = [
  { id: 'up', label: 'Move up', def: 'w' },
  { id: 'down', label: 'Move down', def: 's' },
  { id: 'left', label: 'Move left', def: 'a' },
  { id: 'right', label: 'Move right', def: 'd' },
  { id: 'focus', label: 'Focus (slow, shows hitbox)', def: 'shift' },
  { id: 'pause', label: 'Pause', def: 'escape' },
  { id: 'restart', label: 'Restart run', def: 'r' },
  { id: 'sound', label: 'Sound on / off', def: 'm' },
  { id: 'aim', label: 'Normal / Hard aim', def: 'h' },
]
// keys that are always an alias, whatever is bound
export const ALIASES = { up: ['arrowup'], down: ['arrowdown'], left: ['arrowleft'], right: ['arrowright'], pause: ['p'] }
// keys that cannot be bound (the browser or the game owns them)
export const RESERVED = ['tab', 'f5', 'f12', 'meta', 'os', 'contextmenu']

export const defaults = () => Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]))

export function loadBindings(store) {
  const saved = store.get('controls', null)
  const out = defaults()
  if (saved && typeof saved === 'object') {
    const used = new Set()
    for (const a of ACTIONS) {
      const k = saved[a.id]
      if (typeof k === 'string' && k && !used.has(k) && !RESERVED.includes(k)) {
        out[a.id] = k
        used.add(k)
      }
    }
    // a key must never do two things (a saved file edited by hand): fall back to the defaults
    if (new Set(Object.values(out)).size !== ACTIONS.length) return defaults()
  }
  return out
}

export function saveBindings(store, b) {
  store.set('controls', b)
}

// Bind `key` to `action`. If another action has it, the two swap keys, so no action is ever
// left unbound and no key does two things. Returns {bindings, swapped} or null if refused.
export function rebind(bindings, action, key) {
  key = String(key).toLowerCase()
  if (RESERVED.includes(key)) return null
  const out = { ...bindings }
  const other = Object.keys(out).find((id) => id !== action && out[id] === key)
  let swapped = null
  if (other) {
    out[other] = out[action]
    swapped = other
  }
  out[action] = key
  return { bindings: out, swapped }
}

export function actionOf(bindings, key) {
  for (const id of Object.keys(bindings)) if (bindings[id] === key) return id
  for (const id of Object.keys(ALIASES)) if (ALIASES[id].includes(key)) return id
  return null
}

const NAMES = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', shift: 'Shift', control: 'Ctrl', alt: 'Alt', enter: 'Enter', backspace: 'Backspace', capslock: 'Caps' }
export const keyLabel = (k) => NAMES[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1))
