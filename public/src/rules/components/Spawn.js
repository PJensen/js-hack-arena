// Spawn-point marker.  Cave generator or editor places these.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Spawn = defineComponent('Spawn', {
  team: 0,
  index: 0,
});
