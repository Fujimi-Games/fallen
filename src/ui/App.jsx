import { useEffect, useRef, useState } from 'react'
import { createGame } from '../game/createGame.js'
import { Dossier } from './Dossier.jsx'
import { Record } from './Record.jsx'
import { Settings } from './Settings.jsx'
import { ConsentBanner, Network } from './Network.jsx'
import { createPlatform } from '../platform/danboru.js'

// the menu's star-chart: concentric circles on a dotted axis, a ring of dots that
// turns very slowly, and a few small suns (after an old orrery diagram)
function Orrery() {
  const ring = Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2)
  return (
    <svg className="orrery" viewBox="0 0 540 960" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="#ece3cb" strokeWidth="1">
        <line x1="270" y1="40" x2="270" y2="920" strokeDasharray="1.5 8" opacity="0.4" />
        <circle cx="270" cy="70" r="26" opacity="0.5" />
        <circle cx="270" cy="150" r="62" opacity="0.4" />
        <circle cx="270" cy="150" r="58" opacity="0.25" />
        <circle cx="270" cy="400" r="150" opacity="0.5" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <circle key={i} cx="270" cy={470 + i * 6} r={150 + i * 7} opacity={0.12 + i * 0.03} />
        ))}
        <circle cx="270" cy="700" r="92" opacity="0.4" />
        <circle cx="270" cy="800" r="40" opacity="0.5" />
        <circle cx="270" cy="890" r="24" opacity="0.4" />
      </g>
      <g className="turn" fill="#ece3cb">
        {ring.map((a, i) => (
          <circle key={i} cx={270 + Math.cos(a) * 112} cy={480 + Math.sin(a) * 112} r="1.2" opacity="0.55" />
        ))}
      </g>
      <g fill="#ece3cb">
        <circle cx="270" cy="150" r="7" />
        <circle cx="270" cy="330" r="9" />
        <circle cx="270" cy="800" r="5" />
        <circle cx="448" cy="590" r="4" opacity="0.9" />
        <circle cx="168" cy="578" r="5" opacity="0.9" />
        <circle cx="380" cy="640" r="3.5" opacity="0.8" />
      </g>
    </svg>
  )
}

export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const [hud, setHud] = useState(null)
  const [choosing, setChoosing] = useState(false) // the difficulty step after Play
  const [settings, setSettings] = useState(false)
  // the Fujimi player network; a no-op without the public VITE_GJ_* values
  const [platform] = useState(() => createPlatform(import.meta.env, { appVersion: __APP_VERSION__ }))
  const [net, setNet] = useState(platform.state)
  useEffect(() => platform.subscribe(setNet), [platform])

  useEffect(() => {
    const app = createGame(canvasRef.current, setHud, platform)
    gameRef.current = app.game
    window.__game = app.game
    app.start()
    return () => app.destroy()
  }, [platform])

  const game = gameRef.current
  const attract = hud?.mode === 'attract'
  const openSettings = () => {
    if (game && hud && hud.mode !== 'attract' && !game.paused) game.togglePause() // the fight waits while you rebind
    setSettings(true)
  }

  return (
    <div className="shell">
      {hud && game ? <Dossier hud={hud} /> : <aside className="panel" />}
      <div className="stage">
        <canvas ref={canvasRef} />
        {net.enabled && net.consent === 'unset' && <ConsentBanner platform={platform} />}
        {settings && hud && game && <Settings game={game} hud={hud} onClose={() => setSettings(false)} />}
        {attract && (
          <div className="menu">
            <Orrery />
            <h1>FALLEN</h1>
            <p>Enemies’ Sepulchre</p>
            {!choosing ? (
              <>
                <button className="play" disabled={hud?.busy} onClick={() => setChoosing(true)}>
                  {hud?.busy ? 'Proving fairness…' : 'Play'}
                </button>
                <button className="link settings-link" onClick={openSettings}>
                  Settings
                </button>
                <small className="mathmusic">music: harmonic series · golden-ratio walk · Euclid rhythms · logistic map</small>
              </>
            ) : (
              <div className="difficulty">
                <div className="eyebrow">
                  <i />
                  Difficulty
                  <i />
                </div>
                <div className="choices">
                  {[
                    ['normal', 'Normal', 'you face the boss'],
                    ['hard', 'Hard', 'you aim with the mouse'],
                  ].map(([mode, name, note]) => (
                    <button
                      key={mode}
                      className={`choice ${mode}`}
                      disabled={hud?.busy}
                      onClick={() => {
                        gameRef.current.setAimMode(mode)
                        setChoosing(false)
                        gameRef.current.start()
                      }}
                    >
                      <span>{name}</span>
                      <small>{note}</small>
                    </button>
                  ))}
                </div>
                <button className="link back" onClick={() => setChoosing(false)}>
                  back
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {hud && game ? (
        <Record hud={hud} game={game} onSettings={openSettings}>
          {net.enabled && <Network net={net} platform={platform} />}
        </Record>
      ) : (
        <aside className="panel" />
      )}
    </div>
  )
}
