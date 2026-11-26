import { hue } from './hue.js'
import { keyLabel } from '../game/bindings.js'

export function Record({ hud, game, onSettings, children }) {
  return (
    <aside className="panel record">
      <div className="eyebrow">This run</div>
      <div className="score">
        <strong>{hud.score.toLocaleString('en-US')}</strong>
        <span>
          {hud.bosses} boss{hud.bosses === 1 ? '' : 'es'} cleared
        </span>
        <em>best {hud.best.score.toLocaleString('en-US')} · {hud.best.bosses} bosses</em>
      </div>

      <div className="eyebrow">Lifetime</div>
      <div className="tally">
        <div>
          <strong className="win">{hud.wins}</strong>
          <span>Victories</span>
        </div>
        <div>
          <strong className="loss">{hud.deaths}</strong>
          <span>Fallen</span>
        </div>
      </div>

      <button className="ghost" onClick={() => game.restartRun()} disabled={hud.mode === 'attract'}>
        Restart run <kbd>R</kbd>
      </button>

      <button className="ghost" onClick={() => game.setAimMode(hud.aimMode === 'hard' ? 'normal' : 'hard')}>
        {hud.aimMode === 'hard' ? 'Hard · aim with mouse' : 'Normal · auto-aim'} <kbd>H</kbd>
      </button>

      <button className="ghost" onClick={onSettings}>
        Settings
      </button>

      <button className="ghost" onClick={() => game.toggleSound()}>
        Sound {hud.sound ? 'on' : 'off'} <kbd>M</kbd>
      </button>

      <div className="eyebrow">Life · your traits</div>
      <div className="lives">
        {Array.from({ length: Math.max(hud.hp, 0) }, (_, i) => (
          <i key={i} className={i < hud.inherited ? 'inh' : 'on'} />
        ))}
      </div>
      <p className="fine life-note">
        {hud.streams} stream{hud.streams === 1 ? '' : 's'} + {hud.inherited} inherited. A hit strips one inherited trait first, then a stream. Lose them all and you fall.
      </p>

      <div className="eyebrow">Melee · automatic</div>
      <p className="fine melee-note">
        Swings every {hud.melee?.beats} beats ({hud.melee?.period.toFixed(2)}s): the shortest whole number of beats that fits the longest merged swing and its cooldown.
      </p>

      <div className="eyebrow">Arsenal · merged</div>
      <div className="arsenal">
        {[['spawner', 'Muzzle', 'angles add'], ['motion', 'Flight', 'headings add'], ['mod', 'Rhythm', 'rates multiply'], ['shot', 'Shot', 'split · orbit'], ['melee', 'Melee', 'all swing at once']].map(([slot, label, rule]) => {
          const list = hud.arsenal?.[slot] || []
          return (
            <div key={slot} className={`slot ${list.length ? '' : 'empty'}`}>
              <span className="k">
                {label} · {list.length}/3 <em className="rule">{rule}</em>
              </span>
              {list.length ? (
                list.map((e, i) => (
                  <div className="entry" key={i}>
                    <b style={{ color: hue(e.hue, 72) }}>{e.name}</b>
                    <code>{e.tex}</code>
                  </div>
                ))
              ) : (
                <em>defeat a boss to inherit</em>
              )}
            </div>
          )
        })}
        {hud.inherited > 0 && (
          <button className="link" onClick={() => game.clearArsenal()}>
            clear arsenal
          </button>
        )}
      </div>

      <div className="eyebrow">Controls</div>
      <ul className="keys">
        <li>{['up', 'left', 'down', 'right'].map((x) => <kbd key={x}>{keyLabel(hud.bindings[x])}</kbd>)}<span>move</span></li>
        <li><span>normal: you always face the boss · hard: <kbd>Mouse</kbd> aims</span></li>
        <li><span>3 streams auto-fire; the thick central one hits ×3</span></li>
        <li><span>melee swings by itself, on the beat</span></li>
        <li><kbd>{keyLabel(hud.bindings.focus)}</kbd><span>focus (slow, shows hitbox)</span></li>
        <li><kbd>{keyLabel(hud.bindings.pause)}</kbd><span>pause</span></li>
      </ul>
      <p className="note">Bullets never stop bullets: only melee cuts them.</p>
      {children}
    </aside>
  )
}
