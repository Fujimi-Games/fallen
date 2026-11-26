// Captures the store-page media (metaru/store/) from the real game: a cover, five
// candidate screenshots (shot1-5; the published ones are picked and renamed by hand,
// see docs/DANBORU.md) and a short video, by driving a dev build in headless Chrome over the
// DevTools protocol. Nothing is staged: the boss, its attacks and the HUD are the
// game's own; the script only keeps the player alive (so a run lasts long enough to
// film), steers it with the movement keys, and adds damage so one boss falls in a
// minute instead of several.
//
//   npm run dev            (in another terminal; port 5183)
//   node metaru/capture.mjs
// Needs Google Chrome and ffmpeg. Node 22 (global WebSocket).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'store')
const URL_ = process.env.FALLEN_URL || 'http://localhost:5183/'
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 1280 // the game's three columns (dossier, 9:16 stage, record) fill this frame
const H = 900
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'fallen-capture-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
let ws
try {
  // Chrome picks a free port and writes it, with the browser's path, into the profile
  let port
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(200)
    try {
      port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]
    } catch {}
  }
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
  ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const frames = []
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Page.screencastFrame') {
      frames.push({ data: msg.params.data, t: msg.params.metadata.timestamp })
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId })
    }
  })
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id
      pending.set(n, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
    console.log('wrote', name)
  }
  const key = (k, type) => send('Input.dispatchKeyEvent', { type, key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) })
  const waitFor = async (expr, ms = 60000) => {
    for (let t = 0; t < ms; t += 200) {
      if (await js(expr)) return
      await sleep(200)
    }
    throw new Error('timed out waiting for ' + expr)
  }
  // steer the ship with the movement keys, adding `dmg` to the boss every 100 ms, until
  // `until` (a page expression) is true or `ms` has passed
  const play = async (ms, dmg = 0, until = 'false') => {
    const keys = ['w', 'a', 's', 'd']
    let k = null
    for (let t = 0; t < ms; t += 100) {
      if (t % 500 === 0) {
        if (k) await key(k, 'keyUp')
        k = keys[Math.floor(Math.random() * 4)]
        await key(k, 'keyDown')
      }
      const done = await js(`(() => { const g = __fallen.game; if (${until}) return true; if (${dmg} && g.mode === 'fight' && g.boss.stagger <= 0) g.damageBoss({ x: g.boss.x, y: g.boss.y + 40, a: 0 }, ${dmg}); return false })()`)
      if (done) break
      await sleep(100)
    }
    if (k) await key(k, 'keyUp')
  }

  mkdirSync(OUT, { recursive: true })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: URL_ })
  await waitFor('!!globalThis.__fallen && document.fonts.status === "loaded"')
  // the consent prompt is not part of the game's look; keep it out of the pictures
  await js(`(() => { const s = document.createElement('style'); s.textContent = '.consent{display:none!important}'; document.head.appendChild(s) })()`)
  await waitFor('!__fallen.game.supply.waiting', 120000) // the first boss's fairness proof
  await sleep(1500)
  await shot('cover.jpg')

  await send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 })
  await js(`(() => { const g = __fallen.game; g.hitPlayer = () => {}; g.setAimMode('normal'); g.start() })()`)
  const intro = frames.length // the video starts at the boss's intro, not the wait for its proof
  await waitFor(`__fallen.game.mode === 'fight'`)
  await play(8000)
  await shot('shot1.jpg') // the first boss, assault phase
  const start = await js('__fallen.game.boss.left')
  await play(90000, 1, `g.boss.left !== ${start}`)
  await shot('shot2.jpg') // SEVERED
  await play(90000, 1, `g.boss.phase.id !== 'assault'`)
  await play(5000)
  await shot('shot3.jpg') // fury: the last trait at double tempo
  await play(90000, 2, `g.mode !== 'fight'`)
  await sleep(700)
  await shot('shot4.jpg') // BOSS DOWN and the inherited trait
  await waitFor(`__fallen.game.mode === 'fight'`, 120000)
  await play(9000)
  await shot('shot5.jpg') // the second boss; the inherited trait is in the Arsenal panel and fires from the ship
  await send('Page.stopScreencast')
  await sleep(300)

  // the video: every screencast frame for as long as it was on screen
  const dir = mkdtempSync(join(tmpdir(), 'fallen-frames-'))
  let list = ''
  frames.splice(0, Math.max(0, intro - 10))
  frames.forEach((f, i) => {
    const file = join(dir, `f${String(i).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(f.data, 'base64'))
    const dur = i + 1 < frames.length ? Math.min(0.2, frames[i + 1].t - f.t) : 0.04
    list += `file '${file}'\nduration ${dur.toFixed(4)}\n`
  })
  writeFileSync(join(dir, 'list.txt'), list)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', join(OUT, 'trailer.mp4')])
  rmSync(dir, { recursive: true, force: true })
  console.log(`wrote trailer.mp4 from ${frames.length} frames`)
} finally {
  ws?.close()
  chrome.kill('SIGKILL')
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}
