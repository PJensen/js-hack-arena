export const EffectKind = Object.freeze({
  STAT_MULTIPLIER: 'stat_multiplier',
  ACTION_LOCK: 'action_lock',
  PERIODIC_DAMAGE: 'periodic_damage',
  PERIODIC_HEAL: 'periodic_heal',
});

export const AuraId = Object.freeze({
  FROZEN: 'frozen',
  STUNNED: 'stunned',
  POISONED: 'poisoned',
  ICE_ARMOR: 'ice_armor',
  REGENERATION: 'regeneration',
});

// A visible aura is the semantic parent. The effects below it are generic,
// composable mechanics and do not become separate player-facing statuses.
export const auras = Object.freeze({
  [AuraId.FROZEN]: Object.freeze({
    id: AuraId.FROZEN,
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
  [AuraId.STUNNED]: Object.freeze({
    id: AuraId.STUNNED,
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
  [AuraId.POISONED]: Object.freeze({
    id: AuraId.POISONED,
    name: 'Poisoned',
    glyph: '☠',
    duration: 4,
    disposition: 'harmful',
    visual: 'poisoned',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, amount: 3, interval: 0.6, damageType: 'poison' }),
    ]),
  }),
  [AuraId.ICE_ARMOR]: Object.freeze({
    id: AuraId.ICE_ARMOR,
    name: 'Ice Armor',
    glyph: '◇',
    duration: 6,
    disposition: 'beneficial',
    visual: 'ice_armor',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'damageTaken', value: 0.65 }),
    ]),
  }),
  [AuraId.REGENERATION]: Object.freeze({
    id: AuraId.REGENERATION,
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
