import { EffectKind } from './effectCatalog.js';

export const ConditionId = Object.freeze({
  FROZEN: 'frozen',
  STUNNED: 'stunned',
  POISONED: 'poisoned',
  ICE_ARMOR: 'ice_armor',
  REGENERATION: 'regeneration',
});

export const conditions = Object.freeze({
  [ConditionId.FROZEN]: Object.freeze({
    id: ConditionId.FROZEN,
    name: 'Frozen',
    glyph: '❄',
    duration: 2.4,
    disposition: 'harmful',
    visual: 'frozen',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'movementSpeed', value: 0.25 }),
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'damageTaken', damageType: 'fire', value: 1.1 }),
    ]),
  }),
  [ConditionId.STUNNED]: Object.freeze({
    id: ConditionId.STUNNED,
    name: 'Stunned',
    glyph: '★',
    duration: 0.8,
    disposition: 'harmful',
    visual: 'stunned',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.ACTION_LOCK, action: 'move' }),
      Object.freeze({ kind: EffectKind.ACTION_LOCK, action: 'cast' }),
    ]),
  }),
  [ConditionId.POISONED]: Object.freeze({
    id: ConditionId.POISONED,
    name: 'Poisoned',
    glyph: '☠',
    duration: 4,
    disposition: 'harmful',
    visual: 'poisoned',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, amount: 3, interval: 0.6, damageType: 'poison' }),
    ]),
  }),
  [ConditionId.ICE_ARMOR]: Object.freeze({
    id: ConditionId.ICE_ARMOR,
    name: 'Ice Armor',
    glyph: '◇',
    duration: 6,
    disposition: 'beneficial',
    visual: 'ice_armor',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'damageTaken', value: 0.65 }),
    ]),
  }),
  [ConditionId.REGENERATION]: Object.freeze({
    id: ConditionId.REGENERATION,
    name: 'Regeneration',
    glyph: '✚',
    duration: 6,
    disposition: 'beneficial',
    visual: 'regeneration',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_HEAL, amount: 4, interval: 1 }),
    ]),
  }),
});
