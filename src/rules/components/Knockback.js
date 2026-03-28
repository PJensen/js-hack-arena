// Impulse that decays over time.  Applied on hit, drained by physics.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Knockback = defineComponent('Knockback', {
  dx: 0,
  dy: 0,
  decay: 8,   // how fast it fades (units/s²)
});
