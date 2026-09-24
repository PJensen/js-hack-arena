import { defineComponent } from '../../lib/ecs-js/index.js';

// Derived per-tick memberships. Runtime-only; each entry is keyed by emitter.
export const AuraMemberships = defineComponent('AuraMemberships', {
  active: [],
});
