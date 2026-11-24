// AI behaviour tag — controls mob decision-making.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const AIBehavior = Object.freeze({
  CASTER: 'caster',
  MELEE:  'melee',
  GAZE:   'gaze',
  PASSIVE: 'passive',
  BAT: 'bat',
});

export const WEB_WINDUP_SECONDS = 0.35;
export const GAZE_CHARGE_SECONDS = 2.4;
export const BAT_SHRIEK_WINDUP = 0.55;
export const BAT_SHRIEK_PULSE = 0.45;
export const BAT_SHRIEK_RADIUS = 144;

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
  shriekWindup:   0,
  shriekPulse:    0,
  plantAtContact: false,
  aggroRange:     300,
  sight:          true,
  patrolPoints:   [],
  patrolIndex:    0,
  investigate:    null,
});
