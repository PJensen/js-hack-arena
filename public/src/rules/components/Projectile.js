// Marks an entity as a projectile with damage payload.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Projectile = defineComponent('Projectile', {
  damage: 10,
  owner: null,        // entity ID of shooter (for friendly-fire checks)
  team: 'neutral',    // stable faction even if the owner dies first
  speed: 400,
  piercing: false,
  trailColor: '#8cd8ff',
  burstColor: '#b0e0ff',
  power: 1,           // normalized cast investment, used by damage and VFX
  style: 'frost',     // authored rendering/impact vocabulary
  conditionId: null,
  conditionDuration: 0,
  auraId: null,       // legacy alias for conditionId
  auraDuration: 0,
  impacts: [],        // resolved generic impacts applied on collision
  spellId: null,
  recoverableAmmo: false,
});
