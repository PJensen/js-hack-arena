// AI behaviour tag — controls mob decision-making.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const AIBehavior = Object.freeze({
  CASTER: 'caster',
  MELEE:  'melee',
});

export const AI = defineComponent('AI', {
  behavior:       AIBehavior.CASTER,
  target:         null,
  preferredDist:  140,
  castCooldown:   0,
  castRate:       1.2,
  projSpeed:      250,
  webSpit:        false,
  plantAtContact: false,
  aggroRange:     300,
  sight:          true,
  patrolPoints:   [],
  patrolIndex:    0,
});
