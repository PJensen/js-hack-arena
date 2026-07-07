// Per-frame velocity vector.  Systems integrate this into Position each tick.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Velocity = defineComponent('Velocity', { vx: 0, vy: 0 });
