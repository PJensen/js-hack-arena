// Marks an entity as a projectile with damage payload.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Projectile = defineComponent('Projectile', {
  damage: 10,
  owner: null,        // entity ID of shooter (for friendly-fire checks)
  speed: 400,
  piercing: false,
  trailColor: '#8cd8ff',
  burstColor: '#b0e0ff',
});
