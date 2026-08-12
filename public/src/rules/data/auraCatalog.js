export const EffectKind = Object.freeze({
  STAT_MULTIPLIER: 'stat_multiplier',
  ACTION_LOCK: 'action_lock',
  PERIODIC_DAMAGE: 'periodic_damage',
});

export const AuraId = Object.freeze({
  FROZEN: 'frozen',
  STUNNED: 'stunned',
  POISONED: 'poisoned',
});

// A visible aura is the semantic parent. The effects below it are generic,
// composable mechanics and do not become separate player-facing statuses.
export const auras = Object.freeze({
  [AuraId.FROZEN]: Object.freeze({
    id: AuraId.FROZEN,
    name: 'Frozen',
    glyph: '❄',
    duration: 2.4,
    visual: 'frozen',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'movementSpeed', value: 0.25 }),
    ]),
  }),
  [AuraId.STUNNED]: Object.freeze({
    id: AuraId.STUNNED,
    name: 'Stunned',
    glyph: '★',
    duration: 0.8,
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
    visual: 'poisoned',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.PERIODIC_DAMAGE, amount: 3, interval: 0.6, damageType: 'poison' }),
    ]),
  }),
});
