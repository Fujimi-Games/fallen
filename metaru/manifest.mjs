// FALLEN on Danboru: what the game declares to Metaru. Check and publish with the
// danboru CLI (see docs/DANBORU.md); images are drawn by `node metaru/art.mjs`.
import { RESOURCES, ACHIEVEMENTS, AVATARS, EVENTS } from './catalogue.mjs'
import { LISTING } from './listing.mjs'

const PROPERTY_TYPES = { string: 'string', integer: 'integer', boolean: 'boolean' }

export default {
  app: {
    display_name: 'Fallen',
    listing: LISTING,
  },
  // events are checked by `danboru validate` (achievement rules name them); publish does not send them yet
  events: EVENTS.map((e) => ({
    key: e.key,
    display_name: e.display_name,
    description: e.description,
    properties: Object.entries(e.properties).map(([key, t]) => ({ key, data_type: PROPERTY_TYPES[t] })),
  })),
  resources: RESOURCES,
  achievements: ACHIEVEMENTS,
  avatars: AVATARS,
}
