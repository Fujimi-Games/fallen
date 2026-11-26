// Draws every image the Danboru manifest needs (resources, achievements, avatars)
// from the game's own maths and palette: the curve library in src/content/curves.js,
// the indigo ground, ivory linework and gold of src/ui/App.css. No outside art.
//
//   node metaru/art.mjs          writes metaru/images/*.svg and, with rsvg-convert
//                                on the PATH, the 512 px PNGs the manifest points at.
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURVES, curveSamples } from '../src/content/curves.js'
import { mulberry32 } from '../src/core/rng.js'
import { RESOURCE_ART, ACHIEVEMENT_ART, AVATAR_ART } from './catalogue.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'images')
const S = 512
const C = S / 2
const INK = '#ece3cb'
const GOLD = '#d6b26c'
const TAU = Math.PI * 2

const path = (pts, closed) => 'M' + pts.map(([x, y]) => `${(C + x).toFixed(1)},${(C + y).toFixed(1)}`).join('L') + (closed ? 'Z' : '')
const stroke = (d, col = INK, w = 3, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`
const dot = (x, y, r, col = INK, op = 1) => `<circle cx="${(C + x).toFixed(1)}" cy="${(C + y).toFixed(1)}" r="${r}" fill="${col}" opacity="${op}"/>`
const param = (f, n, R, closed = true) => {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const [x, y] = f((i / n) * TAU)
    pts.push([x * R, y * R])
  }
  return path(pts, closed)
}
const lib = (key, R, seed = 3) => {
  const p = CURVES[key].make(mulberry32(seed))
  return path(curveSamples(key, p, 720, R), CURVES[key].closed)
}
const libDots = (key, R, n, seed = 3) => {
  const p = CURVES[key].make(mulberry32(seed))
  return curveSamples(key, p, n, R).map(([x, y]) => dot(x, y, 5)).join('')
}

// the frame every picture shares: indigo ground, a dotted axis, the orrery rings
function frame(body, { col = INK, rings = true } = {}) {
  const ring = rings
    ? `<circle cx="${C}" cy="${C}" r="232" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.35"/>` +
      `<circle cx="${C}" cy="${C}" r="222" fill="none" stroke="${col}" stroke-width="1" opacity="0.18"/>` +
      `<line x1="${C}" y1="18" x2="${C}" y2="${S - 18}" stroke="${col}" stroke-width="1.5" stroke-dasharray="1.5 9" opacity="0.35"/>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#17294a"/><stop offset="1" stop-color="#0b1424"/></radialGradient></defs>` +
    `<rect width="${S}" height="${S}" fill="url(#g)"/>${ring}${body}</svg>`
  )
}

/* ------------------------------ one glyph per trait ------------------------------ */
const rose = (k, R) => param((t) => [Math.cos(k * t) * Math.cos(t), Math.cos(k * t) * Math.sin(t)], 900, R)
const radial = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU)).join('')
const rotate = (pts, a) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])

export const GLYPHS = {
  // muzzle (spawners)
  phyllotaxis: () => Array.from({ length: 320 }, (_, n) => { const r = 11 * Math.sqrt(n); const a = n * 2.39996; return dot(Math.cos(a) * r, Math.sin(a) * r, 3.2) }).join(''),
  rose: () => stroke(rose(5, 190)),
  superformula: () => stroke(param((t) => { const m = 5, n1 = 0.35, n2 = 0.35, n3 = 0.35; const r = Math.pow(Math.pow(Math.abs(Math.cos((m * t) / 4)), n2) + Math.pow(Math.abs(Math.sin((m * t) / 4)), n3), -1 / n1); return [r * Math.cos(t), r * Math.sin(t)] }, 1200, 190)),
  lissajous: () => stroke(param((t) => [Math.sin(3 * t + Math.PI / 2), Math.sin(2 * t)], 900, 185)),
  spirograph: () => stroke(param((t) => { const R = 5, r = 3, d = 4.2; return [((R - r) * Math.cos(t * 3) + d * Math.cos(((R - r) / r) * t * 3)) / 6.2, ((R - r) * Math.sin(t * 3) - d * Math.sin(((R - r) / r) * t * 3)) / 6.2] }, 2400, 190)),
  epicycloid: () => stroke(lib('epicycloid', 190)),
  hypocycloid: () => stroke(lib('hypocycloid', 190)),
  limacon: () => stroke(lib('limacon', 190)),
  koch: () => stroke(lib('koch', 190)),
  dragon: () => stroke(lib('dragon', 190), INK, 2),
  frost: () => libDots('koch', 190, 54) + stroke(lib('koch', 120), INK, 1.5, 0.4),
  petals: () => libDots('epicycloid', 190, 60) + stroke(lib('epicycloid', 120), INK, 1.5, 0.4),
  chaos: () => { const r = mulberry32(7); let x = 0, y = 0; let s = ''; for (let i = 0; i < 2600; i++) { const a = -Math.PI / 2 + (TAU * Math.floor(r() * 3)) / 3; x = (x + Math.cos(a)) / 2; y = (y + Math.sin(a)) / 2; if (i > 10) s += dot(x * 200, y * 200 + 30, 1.6) } return s },
  // flight (motions): the paths bullets take leaving the muzzle
  straight: () => radial(12, (a) => stroke(path([[Math.cos(a) * 40, Math.sin(a) * 40], [Math.cos(a) * 200, Math.sin(a) * 200]]))),
  snake: () => radial(8, (a) => stroke(path(rotate(Array.from({ length: 60 }, (_, i) => [40 + i * 2.7, 18 * Math.sin(i * 0.35)]), a)))),
  curl: () => radial(6, (a) => stroke(path(rotate(Array.from({ length: 80 }, (_, i) => { const t = i / 79; const r = 30 + 170 * t; const b = 2.2 * t; return [r * Math.cos(b), r * Math.sin(b)] }), a)))),
  flow: () => Array.from({ length: 7 }, (_, j) => stroke(path(Array.from({ length: 60 }, (_, i) => [-200 + i * 6.8, -150 + j * 50 + 26 * Math.sin(i * 0.12 + j * 0.7)]), false))).join(''),
  // rhythm (modulators): how the gun breathes
  spin: () => stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, 170), INK, 2, 0.5) + radial(6, (a) => stroke(path(Array.from({ length: 20 }, (_, i) => { const b = a + i * 0.04; return [170 * Math.cos(b), 170 * Math.sin(b)] })), INK, 5)) + dot(0, 0, 8),
  pendulum: () => stroke(path([[0, -170], [Math.sin(0.5) * 300, -170 + Math.cos(0.5) * 300]])) + stroke(path(Array.from({ length: 41 }, (_, i) => { const a = -0.5 + i * 0.025; return [Math.sin(a) * 300, -170 + Math.cos(a) * 300] }), false), INK, 2, 0.5) + dot(Math.sin(0.5) * 300, -170 + Math.cos(0.5) * 300, 16) + dot(0, -170, 6),
  pulse: () => [60, 110, 160, 205].map((r, i) => stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, r), INK, 4 - i * 0.7, 1 - i * 0.2)).join('') + dot(0, 0, 10),
  drift: () => [0, 1, 2, 3].map((i) => stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, 70), INK, 2.5, 0.25 + i * 0.25).replace('<path', `<path transform="translate(${-90 + i * 60} ${60 - i * 40})"`)).join(''),
  // shot (bullet traits)
  fission: () => dot(-120, 0, 22) + [-0.6, -0.2, 0.2, 0.6].map((a) => stroke(path([[-90, 0], [-90 + 230 * Math.cos(a), 230 * Math.sin(a)]]), INK, 2, 0.5) + dot(-90 + 230 * Math.cos(a), 230 * Math.sin(a), 13)).join(''),
  thorn: () => dot(0, 0, 28) + stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, 110), INK, 1.5, 0.45) + radial(5, (a) => dot(Math.cos(a) * 110, Math.sin(a) * 110, 11)),
  // melee
  blades: () => stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, 150), INK, 1.5, 0.4) + radial(6, (a) => stroke(path([[Math.cos(a) * 110, Math.sin(a) * 110], [Math.cos(a + 0.35) * 200, Math.sin(a + 0.35) * 200]]), INK, 8)) + dot(0, 0, 10),
  sweep: () => `<path d="M${C},${C} L${C + 200 * Math.cos(-2.1)},${C + 200 * Math.sin(-2.1)} A200,200 0 0 1 ${C + 200 * Math.cos(-1.05)},${C + 200 * Math.sin(-1.05)} Z" fill="${INK}" fill-opacity="0.12" stroke="${INK}" stroke-width="3"/>` + [130, 165].map((r) => stroke(param((t) => [Math.cos(-2.1 + (t / TAU) * 1.05), Math.sin(-2.1 + (t / TAU) * 1.05)], 60, r, false), INK, 2, 0.5)).join(''),
  shockwave: () => [70, 120, 175].map((r, i) => stroke(param((t) => [Math.cos(t), Math.sin(t)], 200, r), INK, 9 - i * 3, 1 - i * 0.25)).join(''),
  rosette: () => stroke(rose(4, 195), INK, 3.5),
  spiral: () => radial(4, (a) => stroke(path(rotate(Array.from({ length: 100 }, (_, i) => { const t = i / 99; const r = 12 + 190 * t; return [r * Math.cos(3.4 * t), r * Math.sin(3.4 * t)] }), a)), INK, 4)),
  ribbon: () => stroke(param((t) => [Math.sin(5 * t), Math.sin(4 * t + 0.6)], 1400, 190), INK, 2.5),
  lemniscate: () => stroke(lib('lemniscate', 200)),
  logspiral: () => stroke(lib('logspiral', 200)),
  levy: () => stroke(lib('levy', 190), INK, 2),
  arrowhead: () => stroke(lib('arrowhead', 190), INK, 2.5),
  hilbert: () => stroke(lib('hilbert', 180), INK, 2.5),
}
// melee wires that share a curve with a muzzle trait are drawn thicker, in a ring of three
for (const k of ['limacon', 'epicycloid', 'hypocycloid', 'koch', 'dragon']) GLYPHS['melee_' + k] = () => radial(3, (a) => `<g transform="rotate(${(a * 180) / Math.PI} ${C} ${C}) translate(${C} ${C}) scale(0.62) translate(${-C} ${-C})">${GLYPHS[k]()}</g>`)

/* ------------------------------ achievements and avatars ------------------------------ */
// an achievement: its glyph in gold inside the orrery, with a ring of beads for its tier
function achievement({ glyph, beads = 0 }) {
  const g = `<g transform="translate(${C} ${C}) scale(0.72) translate(${-C} ${-C})">${GLYPHS[glyph]().replaceAll(INK, GOLD)}</g>`
  const ring = Array.from({ length: beads }, (_, i) => { const a = -Math.PI / 2 + (i / beads) * TAU; return dot(Math.cos(a) * 205, Math.sin(a) * 205, 7, GOLD) }).join('')
  return frame(g + ring, { col: GOLD })
}
// the player's own ship: the crescent path src/render/entities.js strokes, enlarged
const CRESCENT = () => `<path d="M-22 -26A34 34 0 1 0 22 -26A24 24 0 0 1 -22 -26Z" transform="translate(${C} ${C + 40}) scale(4.6)" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round"/>` + dot(0, 30, 9, GOLD)
function avatar({ glyph }) {
  if (glyph === 'crescent') return frame(CRESCENT(), { col: GOLD })
  return frame(GLYPHS[glyph]().replaceAll(INK, GOLD), { col: GOLD, rings: false })
}

/* ------------------------------------------ write ------------------------------------------ */
mkdirSync(OUT, { recursive: true })
const jobs = [
  ...RESOURCE_ART.map(([file, glyph]) => [file, frame(GLYPHS[glyph]())]),
  ...ACHIEVEMENT_ART.map(([file, a]) => [file, achievement(a)]),
  ...AVATAR_ART.map(([file, a]) => [file, avatar(a)]),
]
let png = true
try {
  execFileSync('rsvg-convert', ['--version'])
} catch {
  png = false
  console.warn('rsvg-convert not found: SVGs written, convert them to PNG yourself')
}
for (const [file, svg] of jobs) {
  const svgFile = join(OUT, file.replace(/\.png$/, '.svg'))
  writeFileSync(svgFile, svg)
  if (!png) continue
  execFileSync('rsvg-convert', ['-w', String(S), '-h', String(S), '-o', join(OUT, file), svgFile])
  unlinkSync(svgFile)
}
console.log(`${jobs.length} images in ${OUT}`)
