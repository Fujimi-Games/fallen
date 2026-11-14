import { useEffect, useState } from 'react'
import { ACTIONS, defaults, keyLabel, rebind } from '../game/bindings.js'

// The settings panel: rebind every control, choose the aim mode. Click a key, press the new one
// (Esc cancels). Binding a key that another action has swaps the two.
export function Settings({ game, hud, onClose }) {
  const [waiting, setWaiting] = useState(null)
  const [note, setNote] = useState('')
  const b = hud.bindings

  useEffect(() => {
    // the panel owns the keyboard while it is open: nothing reaches the game
    if (!waiting) {
      game.input.capture = (k) => {
        if (k === 'escape') onClose()
      }
    } else {
      game.input.capture = (k) => {
        if (k === 'escape') {
          setWaiting(null)
          return
        }
        const r = rebind(game.input.bindings, waiting, k)
        if (!r) setNote('That key is reserved.')
        else {
          game.setBindings(r.bindings)
          const other = ACTIONS.find((a) => a.id === r.swapped)
          setNote(other ? `${other.label} now uses ${keyLabel(r.bindings[other.id])}.` : '')
        }
        setWaiting(null)
      }
    }
    return () => {
      game.input.capture = null
    }
  }, [waiting, game, onClose])

  return (
    <div className="settings" role="dialog" aria-label="Settings">
      <div className="sheet">
        <div className="eyebrow">
          <i />
          Settings
          <i />
        </div>
        <div className="sub">Controls · click a key, then press the new one</div>
        <div className="rows">
          {ACTIONS.map((a) => (
            <div className="row" key={a.id}>
              <span>{a.label}</span>
              <button className={`keycap ${waiting === a.id ? 'wait' : ''}`} onClick={() => { setNote(''); setWaiting(waiting === a.id ? null : a.id) }}>
                {waiting === a.id ? 'press a key…' : keyLabel(b[a.id])}
              </button>
            </div>
          ))}
        </div>
        <p className="fine">Arrow keys also move, and P also pauses. Esc cancels.</p>
        <div className="sub">Aim</div>
        <div className="aimrow">
          {[['normal', 'Normal', 'auto-aim at the boss'], ['hard', 'Hard', 'aim with the mouse']].map(([m, name, note2]) => (
            <button key={m} className={`choice ${m} ${hud.aimMode === m ? 'on' : ''}`} onClick={() => game.setAimMode(m)}>
              <span>{name}</span>
              <small>{note2}</small>
            </button>
          ))}
        </div>
        <p className="fine note">{note}</p>
        <div className="foot">
          <button className="link" onClick={() => { setNote('Controls reset.'); game.setBindings(defaults()) }}>
            reset controls
          </button>
          <button className="play small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
