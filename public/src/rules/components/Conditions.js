import { defineComponent } from '../../lib/ecs-js/index.js';

// Persistent conditions owned by one actor, with independent lifetimes.
export const Conditions = defineComponent('Conditions', {
  active: [],
});
