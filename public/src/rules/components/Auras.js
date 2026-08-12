import { defineComponent } from '../../lib/ecs-js/index.js';

// Persistent semantic conditions on an actor. Each instance owns its lifetime
// and its concrete child effects; presentation deliberately exposes only the
// parent aura.
export const Auras = defineComponent('Auras', {
  active: [],
});
