// Hit points + optional shield layer.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Health = defineComponent('Health', {
  hp: 100,
  maxHp: 100,
  shield: 0,
  maxShield: 0,
});
