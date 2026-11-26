// FALLEN on Danboru (Fujimi's player network on Metaru): Fujimi account sign-in,
// analytics events behind consent, and the player's achievements.
//
// It sits beside audio and render: createGame wires it to the game's event bus, and
// the game never calls it. Without the three public VITE_GJ_* values (tests, a build
// for another host) every call is a no-op and the game plays as before. A server that
// is down only means nothing is sent: init never rejects and the game never waits on it.
//
// Public values only: the API URL, the server's public key and this build's app key.
// The app secret never reaches this file or the build.
import { createDanboru, fetchTransport, postgrestRoutes, SDK_VERSION } from '@danboru/web-sdk'
import { createClient } from '@supabase/supabase-js'

const PURPOSES = [
  {
    purpose_id: 'analytics',
    display_name: 'Play statistics',
    lawful_basis: 'consent',
    exemption_class: 'none',
  },
]

export const EMPTY = { enabled: false, consent: 'unset', user: null, guest: false, email: null, account: null, achievements: null, busy: false, message: null }

export function createPlatform(env = {}, { appVersion = '0.1.0', window: win = globalThis.window } = {}) {
  const url = env.VITE_GJ_API_URL
  const apiKey = env.VITE_GJ_API_KEY
  const appKey = env.VITE_GJ_APP_KEY
  const listeners = new Set()
  let state = { ...EMPTY, enabled: !!(url && apiKey && appKey && win) }
  const set = (patch) => {
    state = { ...state, ...patch }
    for (const fn of listeners) fn(state)
  }
  const api = {
    get state() {
      return state
    },
    subscribe(fn) {
      listeners.add(fn)
      fn(state)
      return () => listeners.delete(fn)
    },
    attach() {
      return () => {}
    },
    grantConsent() {},
    denyConsent() {},
    signInGuest() {},
    signInEmail() {},
    signOut() {},
    refreshAchievements() {},
    destroy() {},
  }
  if (!state.enabled) return api

  // the Fujimi login (Supabase Auth on Metaru), kept apart from anything else on the page
  const supabase = createClient(url, apiKey, {
    auth: { storageKey: 'fallen.fujimi.auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  let session = null
  const Danboru = createDanboru() // one client per game, like every other collaborator

  Danboru.init({
    apiKey: appKey,
    appVersion,
    transport: fetchTransport({
      endpoint: url,
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      routes: postgrestRoutes({ appKey }),
      accessToken: () => session?.access_token ?? null,
    }),
    consent: { purposes: PURPOSES, defaultPurpose: 'analytics', storagePurpose: 'analytics', noticeVersion: '2026-11-26' },
  })
  const readConsent = () => set({ consent: Danboru.consent.get('analytics') })
  readConsent()
  const offConsent = Danboru.consent.onChange(readConsent)

  // a session appeared (sign-in, guest start, the return from an email link, or a stored one)
  let linkedFor = null
  async function onSession(next, source) {
    session = next
    const user = next?.user ?? null
    if (!user) {
      if (linkedFor) Danboru.reset()
      linkedFor = null
      set({ user: null, guest: false, email: null, account: null, achievements: null })
      return
    }
    set({ user: user.id, guest: !!user.is_anonymous, email: user.email ?? null })
    if (linkedFor === user.id) return
    linkedFor = user.id
    Danboru.setLogin(user.id)
    const link = await supabase.rpc('link_game', {
      p_app_key: appKey,
      p_source: source,
      p_client: { sdk_version: SDK_VERSION, runtime: 'web', build_version: appVersion },
    })
    if (link.error) {
      // a restricted account is refused here (moderation-and-grants.md); say so and stay signed out of the network
      set({ message: /restricted/i.test(link.error.message) ? 'This Fujimi account is restricted in Fallen.' : 'Could not reach the Fujimi network. Your game is not affected.' })
      return
    }
    // the Account id (one per studio pool) is the player id; the login id went to setLogin
    const acc = await supabase.rpc('get_my_account', { p_app_key: appKey })
    const accountId = acc.data?.account_id ?? link.data?.account_id ?? null
    if (accountId) Danboru.identify(accountId)
    set({ account: accountId ? { id: accountId, handle: acc.data?.handle ?? null } : null, message: null })
    api.refreshAchievements()
  }

  supabase.auth.getSession().then(({ data }) => onSession(data.session, 'login'))
  const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') onSession(next, event === 'SIGNED_IN' && next?.user?.is_anonymous ? 'signup' : 'login')
    else if (next) session = next // TOKEN_REFRESHED and friends: keep the newest token for events
  })

  // the game's own events, in the names declared in metaru/catalogue.mjs
  api.attach = (game, events) => {
    const fairness = (def) => (def.fairness ? (def.fairness.forced ? 'best_effort' : 'proven') : 'none')
    const offs = [
      events.on('run', () => Danboru.track('run_started', { aim_mode: game.aimMode })),
      events.on('win', () =>
        Danboru.track('boss_defeated', {
          bosses_in_run: game.run.bosses,
          flawless: game.run.noHit,
          aim_mode: game.aimMode,
          run_score: game.run.score,
          fairness: fairness(game.boss.def),
        }),
      ),
      events.on('sever', ({ trait }) => Danboru.track('trait_severed', { category: trait.cat, trait: trait.kind })),
      events.on('planet', () => Danboru.track('weak_spot_broken', {})),
      events.on('phase', ({ phase }) => Danboru.track('phase_entered', { phase: phase.id })),
      events.on('inherit', ({ slot, key, kind }) => Danboru.track('trait_inherited', { slot, trait: key, result: kind })),
      events.on('hit', () => Danboru.track('player_hit', { lives_left: game.lifeCount() })),
      events.on('lose', () => Danboru.track('run_ended', { reason: 'fell', bosses_in_run: game.run.bosses, run_score: game.run.score, aim_mode: game.aimMode })),
      events.on('abandon', () => Danboru.track('run_ended', { reason: 'abandoned', bosses_in_run: game.run.bosses, run_score: game.run.score, aim_mode: game.aimMode })),
      events.on('win', () => setTimeout(() => api.refreshAchievements(), 8000)), // rules run on the server a few seconds after the event lands
    ]
    return () => offs.forEach((off) => off())
  }

  api.grantConsent = () => Danboru.consent.grant('all', { source: 'banner' })
  api.denyConsent = () => (Danboru.consent.get('analytics') === 'granted' ? Danboru.consent.withdraw('all', { source: 'panel' }) : Danboru.consent.deny('all', { source: 'banner' }))

  const busy = async (fn) => {
    set({ busy: true, message: null })
    try {
      await fn()
    } catch {
      set({ message: 'Could not reach the Fujimi network. Your game is not affected.' })
    } finally {
      set({ busy: false })
    }
  }
  api.signInGuest = () =>
    busy(async () => {
      const { error } = await supabase.auth.signInAnonymously()
      if (error) set({ message: error.message })
    })
  // a guest keeps their account and gets an email added; a signed-out player gets a sign-in link
  api.signInEmail = (email) =>
    busy(async () => {
      const back = win.location.origin + win.location.pathname
      const { error } = state.guest
        ? await supabase.auth.updateUser({ email }, { emailRedirectTo: back })
        : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: back } })
      set({ message: error ? error.message : `Check ${email} for a link from Fujimi.` })
    })
  api.signOut = () => busy(() => supabase.auth.signOut())
  api.refreshAchievements = async () => {
    if (!session) return
    const list = await Danboru.achievements.list()
    if (list) set({ achievements: list })
  }
  api.destroy = () => {
    offConsent()
    sub?.subscription?.unsubscribe()
    Danboru.destroy()
  }
  return api
}
