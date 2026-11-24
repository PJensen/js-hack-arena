import { defineComponent } from '../../lib/ecs-js/index.js';

export const Stamina = defineComponent('Stamina', {
  stamina: 100,
  maxStamina: 100,
  regenPerSecond: 18,
  recoveryDelay: 0,
});
