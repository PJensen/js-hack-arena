import { defineComponent } from '../../lib/ecs-js/index.js';

// Renewable spell resource. regenPerSecond is deliberately data-driven so
// powerups can modify it without changing the regeneration system.
export const Mana = defineComponent('Mana', {
  mana: 100,
  maxMana: 100,
  regenPerSecond: 12,
});
