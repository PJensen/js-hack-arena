// Field-of-view parameters for visibility / perception.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const FOV = defineComponent('FOV', {
  distance: 220,
  angle: (2 * Math.PI) / 3, // 120° in radians
});
