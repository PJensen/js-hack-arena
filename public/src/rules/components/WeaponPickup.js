import { defineComponent } from '../../lib/ecs-js/index.js';

// Authoritative weapon stats on a ground item. The player receives the
// matching equipped component when walking over the pickup.
export const WeaponPickup = defineComponent('WeaponPickup', {
  slot: 'melee',
  damage: 0,
  infiniteArrows: false,
});
