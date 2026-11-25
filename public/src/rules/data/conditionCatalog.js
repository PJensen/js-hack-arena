import { EffectKind } from './effectCatalog.js';

export const HEALTH_POTION_AMOUNT = 25;
const HEALTH_POTION_DURATION = 5;

export const ConditionId = Object.freeze({
  FROZEN: 'frozen',
  SLOWED: 'slowed',
  STUNNED: 'stunned',
  IMMOBILIZED: 'immobilized',
  PARALYZED: 'paralyzed',
  POISONED: 'poisoned',
  BLEEDING: 'bleeding',
  BURNING: 'burning',
  ICE_ARMOR: 'ice_armor',
  REGENERATION: 'regeneration',
  HEALTH_POTION: 'health_potion',
});

export const conditions = Object.freeze({
  [ConditionId.BURNING]: Object.freeze({
    id: ConditionId.BURNING,
    name: 'Burning',
    glyph: '🔥',
    duration: 3,
    disposition: 'harmful',
    visual: 'burning',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, amount: 2, interval: 0.5, damageType: 'fire' }),
    ]),
  }),
  [ConditionId.BLEEDING]: Object.freeze({
    id: ConditionId.BLEEDING,
    name: 'Bleeding',
    glyph: '♦',
    duration: 4,
    disposition: 'harmful',
    visual: 'bleeding',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, amount: 4, interval: 1, damageType: 'physical' }),
    ]),
  }),
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
  [ConditionId.SLOWED]: Object.freeze({
    id: ConditionId.SLOWED,
    name: 'Slowed',
    glyph: '⌄',
    duration: 1.75,
    disposition: 'harmful',
    visual: 'slowed',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'movementSpeed', value: 0.65 }),
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
  [ConditionId.IMMOBILIZED]: Object.freeze({
    id: ConditionId.IMMOBILIZED,
    name: 'Immobilized',
    glyph: '🕸',
    duration: 1.25,
    disposition: 'harmful',
    visual: 'webbed',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.ACTION_LOCK, action: 'move' }),
    ]),
  }),
  [ConditionId.PARALYZED]: Object.freeze({
    id: ConditionId.PARALYZED,
    name: 'Paralyzed',
    glyph: '◉',
    duration: 5,
    disposition: 'harmful',
    visual: 'psychic',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.ACTION_LOCK, action: 'move' }),
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
  [ConditionId.HEALTH_POTION]: Object.freeze({
    id: ConditionId.HEALTH_POTION,
    name: 'Potion Healing',
    glyph: '✚',
    duration: HEALTH_POTION_DURATION,
    disposition: 'beneficial',
    visual: 'regeneration',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_HEAL, amount: HEALTH_POTION_AMOUNT / HEALTH_POTION_DURATION, interval: 1 }),
    ]),
  }),
});
