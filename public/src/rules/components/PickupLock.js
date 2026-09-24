import { defineComponent } from '../../lib/ecs-js/index.js';

// Prevents a player from immediately picking their just-dropped item back up.
export const PickupLock = defineComponent('PickupLock', {
  owner: null,
  remaining: 0,
});
