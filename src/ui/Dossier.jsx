import { VARS, RAMP_LEVELS, ramp } from '../content/difficulty.js'
import { PHASES } from '../sim/phases.js'
import { hue } from './hue.js'

export function Dossier({ hud }) {
  const { def } = hud
  const left = hud.left
  return (
    <aside className="panel dossier">
      <div className="eyebrow">Boss dossier</div>
      <h2 style={{ color: hue(def.hues[0], 72) }}>{def.name}</h2>
      <div className="meta">
        <span>
          SEED {def.code} · LV {def.level}
        </span>
        <span>
          {left} OF {def.traits.length} TRAITS LEFT
        </span>
      </div>

      <div className="phases">
        {PHASES.map((ph) => (
          <span key={ph.id} className={ph.id === hud.phase ? 'on' : ''}>
            {ph.label}
            {ph.pace.far === ph.pace.near ? '' : ` ×${ph.pace.far}–${ph.pace.near}`}
          </span>
        ))}
      </div>

      <div className="swatches">
        {def.traits.filter((t, i, a) => a.findIndex((u) => u.color.h === t.color.h) === i).map((t) => t.color.h).map((h, i) => (
          <i key={i} style={{ background: hue(h, 60) }} />
        ))}
      </div>

      <div className="layers">
        <div className="eyebrow trait-head">Traits · worn down in order</div>
        {def.traits.map((t, i) => {
          const st = hud.traits[i]
          const state = st.gone ? 'gone' : st.now ? 'open' : 'armored'
          return (
            <section key={t.id} className={`trait ${state === 'open' ? 'now' : state}`}>
              <header>
                <b>
                  <u className={`cat ${t.cat}`}>{t.cat === 'melee' ? 'melee' : t.cat === 'ranged' ? 'ranged' : 'move'}</u>
                  {t.name}
                </b>
                <em>
                  {t.label}
                  {t.on ? ` · ${t.on}` : ''}
                </em>
              </header>
              <code>{t.tex}</code>
              <div className="dur">
                <i style={{ width: `${state === 'gone' ? 0 : state === 'armored' ? 100 : (Math.max(0, st.hp) / t.hp) * 100}%`, background: hue(def.hues[0], 62) }} />
                <span>{state === 'gone' ? 'severed' : state === 'armored' ? 'waiting' : `${Math.max(0, st.hp)} / ${t.hp}`}</span>
              </div>
            </section>
          )
        })}
        <section className="trait">
          <header>
            <b>
              <u className="cat move">weak</u>
              {def.weak.name}
            </b>
            <em>
              {hud.spots.length} spot{hud.spots.length === 1 ? '' : 's'} now · respawn every stage
            </em>
          </header>
          <code>{def.weak.tex}</code>
          <div className="dur">
            <span>
              {hud.spots.map((s) => `${Math.max(0, s.hp)}/${s.max}`).join(' · ') || 'none left'}
            </span>
          </div>
        </section>
        <section className="layer proof">
          <header>
            <b>Fairness proof</b>
            <em>{def.fairness ? (def.fairness.forced ? 'best effort' : 'verified') : 'unverified'}</em>
          </header>
          {def.fairness ? (
            <>
              <div className="row">
                <span className="k">Safe space</span>
                <span className="n">
                  ≥ {Math.round(def.fairness.minViable * 100)}% of the arena, at every moment
                </span>
                <code>V<sub>k</sub> = free<sub>k</sub> ∩ dilate(V<sub>k+1</sub>) ≠ ∅</code>
              </div>
              <p className="fine">
                Pace, aim and (in Fury) the boss's own position follow you, so this is an estimate: the proof assumes the fastest pace (×{PHASES[hud.phase === 'fury' ? 1 : 0].pace.near}) and a fixed aim. Now ×{hud.pace.toFixed(2)}.
              </p>
              <p className="fine">
                {def.fairness.scenarios} scenarios × {def.fairness.horizon}s · player at{' '}
                {Math.round(def.fairness.speedFrac * 100)}% speed · +{def.fairness.margin}px clearance · average safe space{' '}
                {Math.round(def.fairness.meanViable * 100)}%
                {def.fairness.intensity < 1 ? ` · density ×${def.fairness.intensity} to meet the bound` : ''}
              </p>
            </>
          ) : (
            <p className="fine">Placeholder boss: not yet proven.</p>
          )}
        </section>
        <section className="layer esc">
          <header>
            <b>Difficulty ramp</b>
            <em>{def.level >= RAMP_LEVELS ? 'plateau' : `level ${def.level} of ${RAMP_LEVELS}`}</em>
          </header>
          <code>v(L) = s + (p − s)·S(L / {RAMP_LEVELS}),  S = smootherstep</code>
          <p className="fine">
            {def.level >= RAMP_LEVELS
              ? 'At the plateau: every variable is at its hardest and stays there. The challenge is endurance.'
              : `Ramping: ${Math.round(ramp(def.level) * 100)}% of the way to the plateau, which starts at ${RAMP_LEVELS} wins.`}
          </p>
          {Object.keys(VARS).filter((key) => !VARS[key].hidden).map((key) => {
            const v = VARS[key]
            const x = def.difficulty[key]
            const pct = Math.max(2, Math.min(100, ((x - v.s) / (v.p - v.s)) * 100))
            const txt = v.fmt === 'x' ? `×${x.toFixed(2)}` : v.fmt === 'px/s' ? `${Math.round(x)} px/s` : v.fmt === 's' ? `${x.toFixed(2)} s` : x.toFixed(2)
            return (
              <div className="var" key={key} title={`first boss ${v.s} → plateau ${v.p}`}>
                <span>{v.label}</span>
                <i>
                  <b style={{ width: `${pct}%` }} />
                </i>
                <em>{txt}</em>
              </div>
            )
          })}
        </section>
        <section className="layer body">
          <header>
            <b>Silhouette</b>
            <em>Gielis superformula</em>
          </header>
          <code>{def.bodyInfo}</code>
        </section>
      </div>
    </aside>
  )
}
