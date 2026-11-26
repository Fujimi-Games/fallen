import { useState } from 'react'

// The consent prompt. [LEGAL REVIEW] the wording is a placeholder for counsel to replace;
// nothing is sent until the player chooses, and Decline sends nothing at all.
export function ConsentBanner({ platform }) {
  return (
    <div className="consent" role="dialog" aria-label="Play statistics">
      <p>
        Share anonymous play statistics with Fujimi? They count runs, bosses and hits, so achievements on your Fujimi account can unlock and the game can be tuned. No name or email is sent with them.
      </p>
      <div className="row">
        <button className="ghost" onClick={() => platform.grantConsent()}>
          Allow
        </button>
        <button className="ghost" onClick={() => platform.denyConsent()}>
          Decline
        </button>
      </div>
    </div>
  )
}

// The Fujimi account: guest or email sign-in, and this game's achievements.
export function Network({ net, platform }) {
  const [email, setEmail] = useState('')
  const list = net.achievements || []
  const unlocked = list.filter((a) => a.unlocked_at)
  const points = unlocked.reduce((n, a) => n + (a.points || 0), 0)
  const submit = (e) => {
    e.preventDefault()
    if (email.includes('@')) platform.signInEmail(email.trim())
  }
  return (
    <div className="network">
      <div className="eyebrow">Fujimi account</div>
      {net.user ? (
        <>
          <p className="fine">
            {net.guest ? 'Playing as a guest.' : `Signed in${net.email ? ` as ${net.email}` : ''}.`}
            {net.account?.handle ? ` Handle ${net.account.handle}.` : ''}
          </p>
          {net.guest && (
            <form className="email" onSubmit={submit}>
              <input type="email" placeholder="email to keep this account" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="link" disabled={net.busy}>
                save
              </button>
            </form>
          )}
          <div className="eyebrow ach-head">
            Achievements · {unlocked.length}/{list.length} · {points} pts
          </div>
          <ul className="achievements">
            {list.map((a) => (
              <li key={a.key} className={a.unlocked_at ? 'got' : ''}>
                <b>{a.display_name ?? 'Hidden'}</b>
                <span>{a.description ?? ''}</span>
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => platform.signOut()} disabled={net.busy}>
            sign out
          </button>
        </>
      ) : (
        <>
          <p className="fine">Sign in to keep your achievements on your Fujimi account, across Fujimi games.</p>
          <button className="ghost" onClick={() => platform.signInGuest()} disabled={net.busy}>
            Play as guest
          </button>
          <form className="email" onSubmit={submit}>
            <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="link" disabled={net.busy}>
              send sign-in link
            </button>
          </form>
        </>
      )}
      {net.message && <p className="fine">{net.message}</p>}
      <p className="fine">
        Play statistics: {net.consent === 'granted' ? 'shared' : net.consent === 'unset' ? 'not chosen' : 'not shared'} ·{' '}
        <button className="link" onClick={() => (net.consent === 'granted' ? platform.denyConsent() : platform.grantConsent())}>
          {net.consent === 'granted' ? 'stop sharing' : 'share'}
        </button>
      </p>
    </div>
  )
}
