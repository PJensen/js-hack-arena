// Generic ability cooldown timer (seconds remaining).
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Cooldown = defineComponent('Cooldown', {
  primary: 0,
  secondary: 0,
  dash: 0,
});
