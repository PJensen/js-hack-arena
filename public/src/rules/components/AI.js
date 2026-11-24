// AI behaviour tag — controls mob decision-making.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const AIBehavior = Object.freeze({
  CASTER: 'caster',
  MELEE:  'melee',
  GAZE:   'gaze',
});

export const WEB_WINDUP_SECONDS = 0.35;
export const GAZE_CHARGE_SECONDS = 2.4;

export const AI = defineComponent('AI', {
  behavior:       AIBehavior.CASTER,
  target:         null,
  preferredDist:  140,
  castCooldown:   0,
  castRate:       1.2,
  projSpeed:      250,
  webSpit:        false,
  webWindup:      0,
  gazeCharge:     0,
  plantAtContact: false,
  aggroRange:     300,
  sight:          true,
  patrolPoints:   [],
  patrolIndex:    0,
});
