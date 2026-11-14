// The look of the game in one place: an esoteric star-chart. Deep indigo paper,
// ivory linework, a little gold, and rust where it can hurt you. Nothing glows.
// The renderer owns one Theme instance and hands it to every drawer, so a
// different art direction is a different Theme, not a rewrite.
export class Theme {
  constructor() {
    this.ivoryRGB = '236,227,203'
    this.goldRGB = '214,178,108'
    this.rustRGB = '198,92,66'
    this.redRGB = '208,58,50' // fury: unmistakably red
    this.deepRGB = '10,18,33'
    this.paper = ['#0f1b30', '#17294a'] // edge, centre of the indigo ground
    this.font = "'Cormorant Garamond', 'Cormorant', 'Iowan Old Style', Georgia, serif"
    this.mono = "'DM Mono', ui-monospace, Menlo, monospace"
    // colour helpers are passed around as plain functions, so keep them bound
    for (const k of ['ink', 'gold', 'rust', 'red', 'deep', 'tint', 'tone', 'pig']) this[k] = this[k].bind(this)
  }

  ink(a = 1) {
    return `rgba(${this.ivoryRGB},${a})`
  }
  gold(a = 1) {
    return `rgba(${this.goldRGB},${a})`
  }
  red(a = 1) {
    return `rgba(${this.redRGB},${a})`
  }
  rust(a = 1) {
    return `rgba(${this.rustRGB},${a})`
  }
  deep(a = 1) {
    return `rgba(${this.deepRGB},${a})`
  }
  // a pigment {h,s,l} (from content/pigments.js) as a CSS colour; dl lightens it
  pig(c, a = 1, dl = 0) {
    return `hsla(${c.h}, ${c.s}%, ${Math.min(92, c.l + dl)}%, ${a})`
  }
  // a boss's own hue as a pale parchment tint, so bosses differ without being loud
  tint(hue, a = 1, l = 78, s = 30) {
    return `hsla(${Math.round(hue)}, ${s}%, ${l}%, ${a})`
  }
  // colour for a bullet / shape colour index (0, 1, 2) of a boss
  tone(def, i, a = 1) {
    return this.pig(def.palette[i] || def.palette[0], a)
  }

  // numerals: Cormorant's are old-style (a 0 looks like an o), so scores use the mono face
  setMono(ctx, size, weight = 400, spacing = 0) {
    ctx.font = `${weight} ${size}px ${this.mono}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
  }

  setFont(ctx, size, weight = 600, spacing = 0, italic = false) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${this.font}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
  }
}
