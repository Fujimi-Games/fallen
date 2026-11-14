// a boss's hue as a pale parchment tint (the whole UI is ivory on indigo)
export const hue = (h, l = 65, a = 1) => `hsla(${Math.round(h)}, 24%, ${Math.min(76, l + 8)}%, ${a})`
