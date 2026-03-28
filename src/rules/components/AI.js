// AI behaviour tag — controls mob decision-making.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const AIBehavior = Object.freeze({
  CASTER: 'caster',
  MELEE:  'melee',
});

export const AI = defineComponent('AI', {
  behavior:      AIBehavior.CASTER,
  target:        null,       // entity ID to track
  preferredDist: 140,        // ideal distance from target
  castCooldown:  0,          // time until next cast
  castRate:      1.2,        // seconds between casts
  projSpeed:     250,
  aggroRange:    300,
  sight:         true,       // has LOS to target this frame
});
