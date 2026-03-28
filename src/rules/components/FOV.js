// Field-of-view parameters for visibility / perception.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const FOV = defineComponent('FOV', {
  distance: 220,
  angle: 1.4,       // radians (~80°)
});
