import { defineComponent } from '../../lib/ecs-js/index.js';

// Timed arcade boosts. Keeping the state explicit makes future pickups easy to
// author and gives presentation one canonical place to telegraph active buffs.
export const Powerups = defineComponent('Powerups', {
  manaRegenMultiplier: 1,
  manaRegenSeconds: 0,
  hasteMultiplier: 1,
  hasteSeconds: 0,
  furyMultiplier: 1,
  furySeconds: 0,
  wardMultiplier: 1,
  wardSeconds: 0,
});
