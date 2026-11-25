import { EffectKind, EffectStat } from './effectCatalog.js';
import { ConditionId } from './conditionCatalog.js';
export { EffectKind };

export const AuraId = Object.freeze({
  CHILLING_PRESENCE: 'chilling_presence',
  HASTE_TOTEM: 'haste_totem',
  CAMPFIRE: 'campfire',
  SPORE_CLOUD: 'spore_cloud',
  BAT_FLAME_PUFF: 'bat_flame_puff',
});

// Spatial fields share the same generic effect operations as conditions.
// Their radius, relationship, and visual describe the emitter, not recipients.
export const auras = Object.freeze({
  [AuraId.CAMPFIRE]: Object.freeze({
    id: AuraId.CAMPFIRE,
    name: 'Campfire',
    radius: 16,
    includeCollider: true,
    targets: 'all',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.APPLY_CONDITION, conditionId: ConditionId.BURNING }),
    ]),
  }),
  [AuraId.SPORE_CLOUD]: Object.freeze({
    id: AuraId.SPORE_CLOUD,
    name: 'Spore Cloud',
    radius: 68,
    duration: 6,
    targets: 'all',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, damageType: 'poison', amount: 6, interval: 0.65 }),
    ]),
  }),
  [AuraId.BAT_FLAME_PUFF]: Object.freeze({
    id: AuraId.BAT_FLAME_PUFF,
    name: 'Bat Flame',
    radius: 28,
    duration: 1.1,
    targets: 'hostile',
    team: 'hostile',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, damageType: 'fire', amount: 3, interval: 0.25 }),
    ]),
  }),
  [AuraId.CHILLING_PRESENCE]: Object.freeze({
    id: AuraId.CHILLING_PRESENCE,
    name: 'Chilling Presence',
    radius: 90,
    team: 'hostile',
    targets: 'hostile',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: EffectStat.MOVEMENT_SPEED, value: 0.7 }),
    ]),
    visual: Object.freeze({ glyph: '❄', color: Object.freeze([0.32, 0.78, 1]) }),
  }),
  [AuraId.HASTE_TOTEM]: Object.freeze({
    id: AuraId.HASTE_TOTEM,
    name: 'Haste Totem',
    radius: 110,
    team: 'friendly',
    targets: 'friendly',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: EffectStat.MOVEMENT_SPEED, value: 1.2 }),
    ]),
    visual: Object.freeze({ glyph: '»', color: Object.freeze([0.28, 1, 0.68]) }),
  }),
});
