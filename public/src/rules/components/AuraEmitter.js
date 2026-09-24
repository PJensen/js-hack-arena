import { defineComponent } from '../../lib/ecs-js/index.js';

// Persistent spatial field. Attach to any positioned entity, including actors,
// items, totems, or standalone field entities.
export const AuraEmitter = defineComponent('AuraEmitter', {
  id: '',
  name: '',
  radius: 0,
  targets: 'all',
  team: null,
  effects: [],
  visual: { glyph: '◌', color: [0.65, 0.85, 1] },
  duration: 0,
  remaining: -1,
  active: true,
});
